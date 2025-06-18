import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import 'dotenv/config';
import crypto from 'crypto';
import { Router } from 'express';
import { authMiddleware } from './auth.js';
import fs from 'fs';
import { logger } from '../utils/logger.js';

const abi = JSON.parse(fs.readFileSync('./abi/new_contract_abi.json', 'utf-8'));
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
  const { electionId, candidate } = req.body;
  try {
    const tx = await contract.registerCandidate(electionId, candidate);
    await tx.wait();
    logger.info(`Candidate registered: ${JSON.stringify(candidate)}, txHash: ${tx.hash}`);
    res.json({ message: "Candidate registered", txHash: tx.hash });
  } catch (err) {
    if (err.message.includes("Candidate already registered")) {
      logger.warn(`Candidate already registered: ${JSON.stringify(candidate)}`);
      return res.status(400).json({ message: "Candidate Already Registered" });
    }
    logger.error(`Error registering candidate: ${err.message}`); 
  }
});

// Remove a candidate
router.delete("/remove", async (req, res) => {
  const { electionId, candidate } = req.body;
  try {
    const tx = await contract.removeCandidate(electionId, candidate);
    await tx.wait();
    logger.info(`Candidate removed: ${JSON.stringify(candidate)}, txHash: ${tx.hash}`);
    res.json({ message: "Candidate removed", txHash: tx.hash });
  } catch (err) {
    logger.error(`Error removing candidate: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});


router.post("/vote", async (req, res) => {
  const { electionId, uid, candidate } = req.body;

  try {
    const hashedUid = hashUid(uid);
    const tx = await contract.vote(electionId, hashedUid, candidate);
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
      res.status(400).send({ error: "You have already voted in this election." });
    } else {
      res.status(500).send({ error: err.message });
    }
  }
});

// End election
router.post("/end", async (req, res) => {
  const { electionId } = req.body;
  try {
    const tx = await contract.endElection(electionId);
    await tx.wait();
    logger.info(`Election ended: ${electionId}, txHash: ${tx.hash}`);
    res.json({ message: "Election ended", txHash: tx.hash });
  } catch (err) {
    logger.error(`Error ending election: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Read all elections
router.get("/elections", async (req, res) => {
  try {
    const elections = await contract.getAllElections();
    logger.info(`Fetched all elections: ${elections.length} elections`);
    res.json({ elections });
  } catch (err) {
    logger.error(`Error fetching elections: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Admin-only result view
router.get("/votesByElection", async (req, res) => {
  const { electionId } = req.query;

  if (!electionId) {
    return res.status(400).json({ error: "electionId query parameter is required" });
  }

  try {
    console.log(`Fetching votes for election: ${electionId}`);
    const [candidates, counts, totalVotes] = await contract.getCandidateVotesAndTotalElectionVotes(electionId);
    const results = candidates.map((candidate, index) => ({
      candidate,
      votes: counts[index].toString(),
    }));
    logger.info(`Admin fetched results for election: ${electionId}`);
    res.json({ result: results, totalVotes: totalVotes.toString() });
  } catch (err) {
    logger.error(`Error fetching all vote counts: ${err.message}`);
    res.status(400).json({
      error: "Election ID does not exist",
      electionId,
      results: []
    });
  }
});



router.get("/votesByElection1", async (req, res) => {
  const { electionId } = req.params;

  try {
    const [candidates, counts, totalVotes] = await contract.getCandidateVotesAndTotalElectionVotesPublic(electionId);
    const results = candidates.map((candidate, index) => ({
      candidate,
      votes: counts[index].toString(),
    }));
    logger.info(`Public results fetched for election: ${electionId}`);
    res.json({ results, totalVotes: totalVotes.toString() });
  } catch (err) {
    logger.error(`Error fetching public results: ${err.message}`);
    res.status(500).json({ error: err.message });
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
    const [candidates, counts, totalVotes] = await contract.getCandidateVotesAndTotalElectionVotesPublic(electionId);
    const results = candidates.map((candidate, index) => ({
      candidate,
      votes: counts[index].toString(),
    }));
    logger.info(`Public results fetched for election: ${electionId}`);
    res.json({ results, totalVotes: totalVotes.toString() });
  } catch (err) {
    logger.error(`Error fetching public results: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Check if a user has voted

router.get("/checkVoted", async (req, res) => {
  const { electionId, uid } = req.query;

  if (!electionId || !uid) {
    return res.status(400).send({ error: "Both electionId and VoterID are required" });
  }

  try {
    const votes = await contract.hasUserVoted(electionId, hashUid(uid));
    console.log(votes);
    res.send({ voted: votes.toString() });
  } catch (err) {
    logger.error(`Error fetching data: ${err.message}`);
    res.status(500).send({ error: err.message });
  }
});


export default router;