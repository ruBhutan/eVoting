// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    address public owner;

    struct Vote {
        string candidate;
        string electionId;
    }

    // Track voting
    mapping(string => mapping(string => bool)) private hasVoted; // electionId => uid => bool (wthether particular uid has voted in this election)
    mapping(string => mapping(string => uint256)) private voteCount; // electionId => candidate => count (number of votes for this candidate in this election)
    mapping(string => Vote) private votes; // UID => Vote (candidate, electionId)

    // Track elections and candidates
    string[] private electionIds;
    mapping(string => bool) private electionExists;

    mapping(string => string[]) private candidatesPerElection; // electionId => candidates[]
    mapping(string => mapping(string => bool)) private isCandidateTracked; // electionId => candidate => tracked?

    event VoteCast(string indexed electionId, string indexed uid);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function vote(string memory electionId, string memory uid, string memory candidate) public onlyOwner {
        if (!electionExists[electionId]) {
            electionExists[electionId] = true;
            electionIds.push(electionId);
        }

        require(!hasVoted[electionId][uid], "Already voted in this election");

        if (!isCandidateTracked[electionId][candidate]) {
            isCandidateTracked[electionId][candidate] = true;
            candidatesPerElection[electionId].push(candidate);
        }

        votes[uid] = Vote(candidate, electionId);
        hasVoted[electionId][uid] = true;
        voteCount[electionId][candidate] += 1;

        emit VoteCast(electionId, uid);
    }

    function getVoteCount(string memory electionId, string memory candidate) public view onlyOwner returns (uint256) {
        require(electionExists[electionId], "Election ID does not exist");
        return voteCount[electionId][candidate];
    }

    function getAllVoteCounts(string memory electionId) public view onlyOwner returns (string[] memory, uint256[] memory) {
        require(electionExists[electionId], "Election ID does not exist");

        string[] memory candidates = candidatesPerElection[electionId];
        uint256[] memory counts = new uint256[](candidates.length);

        for (uint i = 0; i < candidates.length; i++) {
            counts[i] = voteCount[electionId][candidates[i]];
        }

        return (candidates, counts);
    }

    function getAllElections() public view returns (string[] memory) {
        return electionIds;
    }
}