import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import 'dotenv/config';
import crypto from 'crypto';
import { Router } from 'express';
import { authMiddleware } from './auth.js';
import fs from 'fs';
import { logger } from './logger.js';

const abi = JSON.parse(fs.readFileSync('./abi.json', 'utf-8'));
const router = Router();
router.use(authMiddleware);

const provider = new JsonRpcProvider(process.env.AMOY_RPC_URL);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
//const contractAddress = "0xB0D6CAdcCD318883778a957CA45DD7De8F50Bb7a";
const contractAddress = process.env.CONTRACT_ADDRESS
const contract = new Contract(contractAddress, abi, wallet);

function hashUid(uid) {
  const secretUid = process.env.SECRET_PHRASE + uid;
  return crypto.createHash("sha256").update(secretUid).digest("hex");
}

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

router.get("/votesByElection", async (req, res) => {
  const { electionId } = req.query;

  if (!electionId) {
    return res.status(400).send({ error: "Missing electionId in query" });
  }

  try {
    const [candidates, counts] = await contract.getAllVoteCounts(electionId);
    const results = candidates.map((candidate, index) => ({
      candidate,
      votes: counts[index].toString(),
    }));

    res.send({ electionId, results });
  } catch (err) {
    logger.error(`Error fetching all vote counts: ${err.message}`);
    res.status(500).send({ error: err.reason || err.message });
  }
});

router.get("/getElectionsList", async (req, res) => {
  try {
    const elections = await contract.getAllElections();
    res.send({ elections });
  } catch (err) {
    logger.error(`Error fetching elections: ${err.message}`);
    res.status(500).send({ error: err.message });
  }
});

router.get("/votes", async (req, res) => {
  const { electionId, candidate } = req.query;

  if (!electionId || !candidate) {
    return res.status(400).send({ error: "Both electionId and candidate are required" });
  }

  try {
    const votes = await contract.getVoteCount(electionId, candidate);
    res.send({ candidate, votes: votes.toString() });
  } catch (err) {
    logger.error(`Error fetching vote count: ${err.message}`);
    res.status(500).send({ error: err.message });
  }
});

router.get("/checkVoted", async (req, res) => {
  const { electionId, candidate } = req.query;

  if (!electionId || !candidate) {
    return res.status(400).send({ error: "Both electionId and candidate are required" });
  }

  try {
    const votes = await contract.hasUserVoted(electionId, candidate);
    console.log(votes);
    res.send({ voted: votes.toString() });
  } catch (err) {
    logger.error(`Error fetching data: ${err.message}`);
    res.status(500).send({ error: err.message });
  }
});

export default router;
