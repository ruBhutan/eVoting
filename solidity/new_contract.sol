// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    address public owner;

    struct Vote {
        string candidate;
        string electionId;
    }

    mapping(string => mapping(string => bool)) private hasVoted;
    mapping(string => mapping(string => uint256)) private voteCount;
    mapping(string => Vote) private votes;

    string[] private electionIds;
    mapping(string => bool) private electionExists;
    mapping(string => bool) private electionEnded;

    mapping(string => string[]) private candidatesPerElection;
    mapping(string => mapping(string => bool)) private isCandidateTracked;

    event VoteCast(string indexed electionId, string indexed uid);
    event CandidateRegistered(string indexed electionId, string indexed candidate);
    event CandidateRemoved(string indexed electionId, string indexed candidate);
    event ElectionEnded(string indexed electionId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerCandidate(string memory electionId, string memory candidate) public onlyOwner {
        require(!isCandidateTracked[electionId][candidate], "Candidate already registered");

        if (!electionExists[electionId]) {
            electionExists[electionId] = true;
            electionIds.push(electionId);
        }

        isCandidateTracked[electionId][candidate] = true;
        candidatesPerElection[electionId].push(candidate);

        emit CandidateRegistered(electionId, candidate);
    }

    function removeCandidate(string memory electionId, string memory candidate) public onlyOwner {
        require(electionExists[electionId], "Election does not exist");
        require(isCandidateTracked[electionId][candidate], "Candidate not registered");

        // Remove from tracking
        isCandidateTracked[electionId][candidate] = false;
        voteCount[electionId][candidate] = 0;

        // Remove from array
        string[] storage candidates = candidatesPerElection[electionId];
        for (uint i = 0; i < candidates.length; i++) {
            if (keccak256(bytes(candidates[i])) == keccak256(bytes(candidate))) {
                candidates[i] = candidates[candidates.length - 1];
                candidates.pop();
                break;
            }
        }

        emit CandidateRemoved(electionId, candidate);
    }

    function endElection(string memory electionId) public onlyOwner {
        require(electionExists[electionId], "Election does not exist");
        electionEnded[electionId] = true;
        emit ElectionEnded(electionId);
    }

    function vote(string memory electionId, string memory uid, string memory candidate) public onlyOwner {
        require(electionExists[electionId], "Election does not exist");
        //require(!electionEnded[electionId], "Election already ended");
        require(isCandidateTracked[electionId][candidate], "Candidate not registered");
        require(!hasVoted[electionId][uid], "Already voted in this election");

        votes[uid] = Vote(candidate, electionId);
        hasVoted[electionId][uid] = true;
        voteCount[electionId][candidate] += 1;

        emit VoteCast(electionId, uid);
    }

    // ✅ Internal owner-only version (always shows)
    function getCandidateVotesAndTotalElectionVotes(string memory electionId)
        public
        view
        onlyOwner
        returns (string[] memory candidates, uint256[] memory candidateVotes, uint256 totalVotes)
    {
        require(electionExists[electionId], "Election ID does not exist");

        candidates = candidatesPerElection[electionId];
        candidateVotes = new uint256[](candidates.length);
        totalVotes = 0;

        for (uint i = 0; i < candidates.length; i++) {
            candidateVotes[i] = voteCount[electionId][candidates[i]];
            totalVotes += candidateVotes[i];
        }

        return (candidates, candidateVotes, totalVotes);
    }

    // ✅ Public version (visible only if election is ended)
    function getCandidateVotesAndTotalElectionVotesPublic(string memory electionId)
        public
        view
        returns (string[] memory candidates, uint256[] memory candidateVotes, uint256 totalVotes)
    {
        require(electionExists[electionId], "Election does not exist");
        //require(electionEnded[electionId], "Election results not available yet");

        candidates = candidatesPerElection[electionId];
        candidateVotes = new uint256[](candidates.length);
        totalVotes = 0;

        for (uint i = 0; i < candidates.length; i++) {
            candidateVotes[i] = voteCount[electionId][candidates[i]];
            totalVotes += candidateVotes[i];
        }

        return (candidates, candidateVotes, totalVotes);
    }

    function getAllElections() public view onlyOwner returns (string[] memory) {
        return electionIds;
    }

    function hasUserVoted(string memory electionId, string memory uid) public view onlyOwner returns (bool) {
        return hasVoted[electionId][uid];
    }

    function isElectionEnded(string memory electionId) public view returns (bool) {
        return electionEnded[electionId];
    }
}
