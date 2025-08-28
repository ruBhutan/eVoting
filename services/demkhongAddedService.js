import crypto from 'crypto';
import 'dotenv/config';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { Router } from 'express';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { authMiddleware } from './auth.js';

const abi = JSON.parse(fs.readFileSync('./abi/demkhongAbi.json', 'utf-8'));
const router = Router();
router.use(authMiddleware);

const provider = new JsonRpcProvider(process.env.AMOY_RPC_URL);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
const contractAddress = process.env.CONTRACT_ADDRESS;

const contract = new Contract(contractAddress, abi, wallet);

function hashUid(uid) {
    const secretUid = process.env.SECRET_PHRASE + uid;
    return crypto.createHash("sha256").update(secretUid).digest("hex");
}

// Register a candidate
router.post("/register", async (req, res) => {
    const { electionId, candidate, demkhong } = req.body;

    if (!electionId || !candidate || !demkhong) {
        return res.status(400).json({ error: "Missing required fields: electionId, candidate, or demkhong" });
    }

    try {
        const tx = await contract.registerCandidate(electionId, candidate, demkhong);
        await tx.wait();
        logger.info(`Candidate registered: ${candidate} in ${demkhong}, txHash: ${tx.hash}`);
        res.json({ message: "Candidate registered", txHash: tx.hash });
    } catch (err) {
        if (err.message.includes("Candidate already registered")) {
            logger.warn(`Candidate already registered: ${candidate}`);
            return res.status(409).json({ message: "Candidate Already Registered" });
        }
        if (err.message.includes("Not the owner")) {
            logger.warn(`Unauthorized candidate registration attempt: ${candidate}`);
            return res.status(403).json({ message: "Unauthorized: Only contract owner can register candidates" });
        }
        logger.error(`Error registering candidate: ${err.message}`);
        res.status(400).json({ error: err.message });
    }
});

// Remove a candidate
router.delete("/remove", async (req, res) => {
    const { electionId, candidate } = req.body;

    if (!electionId || !candidate) {
        return res.status(400).json({ error: "Missing required fields: electionId or candidate" });
    }

    try {
        const tx = await contract.removeCandidate(electionId, candidate);
        await tx.wait();
        logger.info(`Candidate removed: ${candidate}, txHash: ${tx.hash}`);
        res.json({ message: "Candidate removed", txHash: tx.hash });
    } catch (err) {
        if (err.message.includes("Candidate not registered")) {
            logger.warn(`Candidate not found: ${candidate}`);
            return res.status(404).json({ error: "Candidate not registered" });
        }
        if (err.message.includes("Not the owner")) {
            logger.warn(`Unauthorized candidate removal attempt: ${candidate}`);
            return res.status(403).json({ message: "Unauthorized: Only contract owner can remove candidates" });
        }
        if (err.message.includes("Election does not exist")) {
            return res.status(404).json({ error: "Election does not exist" });
        }
        logger.error(`Error removing candidate: ${err.message}`);
        res.status(400).json({ error: err.message });
    }
});

// Cast a vote
router.post("/vote", async (req, res) => {
    const { electionId, uid, candidate, gender } = req.body;

    if (!electionId || !uid || !candidate || !gender) {
        return res.status(400).send({ error: "Missing required fields: electionId, uid, candidate, or gender" });
    }

    try {
        const hashedUid = hashUid(uid);
        const tx = await contract.vote(electionId, hashedUid, candidate, gender);
        const receipt = await tx.wait();

        const txStatus = receipt.status === 1 ? "success" : "fail";
        logger.info(`Vote cast | Tx: ${tx.hash} | Status: ${txStatus}`);

        res.send({
            message: "Vote cast successfully",
            txHash: tx.hash,
            txStatus,
            explorerLink: `https://amoy.polygonscan.com/tx/${tx.hash}`
        });
    } catch (err) {
        logger.error(`Error casting vote: ${err.message}`);
        if (err.message.includes("Already voted in this election")) {
            res.status(409).send({ error: "You have already voted in this election." });
        } else if (err.message.includes("Candidate not registered")) {
            res.status(404).send({ error: "Candidate is not registered for this election." });
        } else if (err.message.includes("Invalid gender string")) {
            res.status(400).send({ error: "Invalid gender. Use 'Male' or 'Female'." });
        } else if (err.message.includes("Election does not exist")) {
            res.status(404).send({ error: "Election does not exist." });
        } else if (err.message.includes("Not the owner")) {
            res.status(403).send({ error: "Unauthorized: Only contract owner can cast votes" });
        } else {
            res.status(400).send({ error: err.message });
        }
    }
});

// End election
router.post("/end", async (req, res) => {
    const { electionId } = req.body;

    if (!electionId) {
        return res.status(400).json({ error: "Missing required field: electionId" });
    }

    try {
        const tx = await contract.endElection(electionId);
        await tx.wait();
        logger.info(`Election ended: ${electionId}, txHash: ${tx.hash}`);
        res.json({ message: "Election ended", txHash: tx.hash });
    } catch (err) {
        if (err.message.includes("Election does not exist")) {
            return res.status(404).json({ error: "Election does not exist" });
        }
        if (err.message.includes("Not the owner")) {
            logger.warn(`Unauthorized election end attempt: ${electionId}`);
            return res.status(403).json({ message: "Unauthorized: Only contract owner can end elections" });
        }
        logger.error(`Error ending election: ${err.message}`);
        res.status(400).json({ error: err.message });
    }
});

// Read all elections
router.get("/elections", async (req, res) => {
    try {
        const elections = await contract.getAllElections();
        logger.info(`Fetched all elections: ${elections.length} elections`);
        res.json({ elections });
    } catch (err) {
        if (err.message.includes("Not the owner")) {
            logger.warn(`Unauthorized elections fetch attempt`);
            return res.status(403).json({ message: "Unauthorized: Only contract owner can view elections" });
        }
        logger.error(`Error fetching elections: ${err.message}`);
        res.status(400).json({ error: err.message });
    }
});

// Admin-only result view with enhanced data
router.get("/votesByElection", async (req, res) => {
    const { electionId } = req.query;

    if (!electionId) {
        return res.status(400).json({ error: "electionId query parameter is required" });
    }

    try {
        console.log(`Fetching votes for election: ${electionId}`);
        const [candidates, demkhongs, candidateVotes, totalVotes, totalMale, totalFemale] =
            await contract.getCandidateVotesAndTotalElectionVotes(electionId);

        const results = candidates.map((candidate, index) => ({
            candidate,
            demkhong: demkhongs[index],
            votes: candidateVotes[index].toString(),
        }));

        logger.info(`Admin fetched results for election: ${electionId}`);
        res.json({
            results,
            totalVotes: totalVotes.toString(),
            totalMale: totalMale.toString(),
            totalFemale: totalFemale.toString()
        });
    } catch (err) {
        if (err.message.includes("Election ID does not exist")) {
            logger.warn(`Election not found: ${electionId}`);
            return res.status(404).json({
                error: "Election ID does not exist",
                electionId,
                results: []
            });
        }
        if (err.message.includes("Not the owner")) {
            logger.warn(`Unauthorized results fetch attempt: ${electionId}`);
            return res.status(403).json({ message: "Unauthorized: Only contract owner can view detailed results" });
        }
        logger.error(`Error fetching all vote counts: ${err.message}`);
        res.status(400).json({
            error: "Error fetching election results",
            electionId,
            results: []
        });
    }
});

// Get constituency (demkhong) results
router.get("/demkhongResults", async (req, res) => {
    const { electionId } = req.query;

    if (!electionId) {
        return res.status(400).json({ error: "electionId query parameter is required" });
    }

    try {
        const [demkhongs, totalVotesByDemkhong, maleByDemkhong, femaleByDemkhong] =
            await contract.getDemkhongResults(electionId);

        const results = demkhongs.map((demkhong, index) => ({
            demkhong,
            totalVotes: totalVotesByDemkhong[index].toString(),
            maleVotes: maleByDemkhong[index].toString(),
            femaleVotes: femaleByDemkhong[index].toString()
        }));

        logger.info(`Fetched constituency results for election: ${electionId}`);
        res.json({ results });
    } catch (err) {
        if (err.message.includes("Election does not exist")) {
            return res.status(404).json({
                error: "Election ID does not exist",
                electionId,
                results: []
            });
        }
        if (err.message.includes("Not the owner")) {
            logger.warn(`Unauthorized constituency results fetch attempt: ${electionId}`);
            return res.status(403).json({ message: "Unauthorized: Only contract owner can view constituency results" });
        }
        logger.error(`Error fetching constituency results: ${err.message}`);
        res.status(400).json({
            error: "Error fetching constituency results",
            electionId,
            results: []
        });
    }
});

// Public result (only if ended)
router.get("/public-result/:electionId", async (req, res) => {
    try {
        const { electionId } = req.params;
        const isEnded = await contract.isElectionEnded(electionId);
        if (!isEnded) {
            logger.warn(`Public result request denied - election not ended: ${electionId}`);
            return res.status(403).json({ message: "Election is not yet ended." });
        }

        const [candidates, demkhongs, candidateVotes, totalVotes, totalMale, totalFemale] =
            await contract.getCandidateVotesAndTotalElectionVotes(electionId);

        const results = candidates.map((candidate, index) => ({
            candidate,
            demkhong: demkhongs[index],
            votes: candidateVotes[index].toString(),
        }));

        logger.info(`Public results fetched for election: ${electionId}`);
        res.json({
            results,
            totalVotes: totalVotes.toString(),
            totalMale: totalMale.toString(),
            totalFemale: totalFemale.toString()
        });
    } catch (err) {
        if (err.message.includes("Election ID does not exist")) {
            return res.status(404).json({ error: "Election does not exist" });
        }
        logger.error(`Error fetching public results: ${err.message}`);
        res.status(400).json({ error: "Error fetching election results" });
    }
});

// Check if a user has voted
router.get("/checkVoted", async (req, res) => {
    const { electionId, uid } = req.query;

    if (!electionId || !uid) {
        return res.status(400).send({ error: "Both electionId and VoterID are required" });
    }

    try {
        const hasVoted = await contract.hasUserVoted(electionId, hashUid(uid));
        res.send({ voted: hasVoted });
    } catch (err) {
        if (err.message.includes("Not the owner")) {
            logger.warn(`Unauthorized vote check attempt: ${electionId}, ${uid}`);
            return res.status(403).send({ error: "Unauthorized: Only contract owner can check vote status" });
        }
        logger.error(`Error checking vote status: ${err.message}`);
        res.status(400).send({ error: "Error checking vote status" });
    }
});

export default router;