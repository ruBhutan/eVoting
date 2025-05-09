import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import abi from './abi.json' assert { type: "json" };
import 'dotenv/config';
import crypto from 'crypto';
import { Router } from 'express';
import {authMiddleware} from './auth.js';

const router = Router();
router.use(authMiddleware);

const provider = new JsonRpcProvider(process.env.AMOY_RPC_URL);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);
//const wallet = "0xb0325e5a4451BDFBB00aB0478b78BbB8f7f85BE2"
const contractAddress = "0xB0D6CAdcCD318883778a957CA45DD7De8F50Bb7a";
const contract = new Contract(contractAddress, abi, wallet);

// Hash UID
function hashUid(uid) {
  const secretUid = process.env.SECRET_PHRASE + uid;
  return crypto.createHash("sha256").update(secretUid).digest("hex");
}

// POST /vote
router.post("/vote", authMiddleware, async (req, res) => {
  const { electionId, uid, candidate } = req.body;

  try {
    const hashedUid = hashUid(uid);
    const tx = await contract.vote(electionId, hashedUid, candidate);
    await tx.wait();
    const receipt = await tx.wait();
    // Determine success or fail based on the status
    const txStatus = receipt.status === 1 ? "success" : "fail";

    res.send({
      message: "Vote cast successfully",
      txHash: tx.hash, // Transaction hash
      txStatus: txStatus,
      explorerLink: `https://amoy.polygonscan.com/tx/${tx.hash}` // "success" if status is 1, "fail" if status is 0
    });
  } catch (err) {
    console.error("Error casting vote:", err);

    if (err.message.includes("Already voted in this election")) {
      res
        .status(400)
        .send({ error: "You have already voted in this election." });
    } else {
      res.status(500).send({ error: err.message });
    }
  }
});

// GET /votes/votesByElection?electionId=election2025
// This endpoint retrieves the vote counts for all candidates in a specific election

router.get("/votesByElection", authMiddleware, async (req, res) => {
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
    console.error("Error fetching all vote counts:", err);
    res.status(500).send({ error: err.reason || err.message });
  }
});

// GET /votes?electionId=election2025&candidate=candidate1
// This endpoint retrieves the vote count for a specific candidate in a specific election
router.get("/votes", authMiddleware, async (req, res) => {
  const { electionId, candidate } = req.query;

  if (!electionId || !candidate) {
    return res
      .status(400)
      .send({ error: "Both electionId and candidate are required" });
  }

  try {
    const votes = await contract.getVoteCount(electionId, candidate);
    res.send({ candidate, votes: votes.toString() });
  } catch (err) {
    console.error("Error fetching vote count:", err);
    res.status(500).send({ error: err.message });
  }
});
export default router;