// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    address public owner;

    enum Gender {
        Male,
        Female
    }

    struct Vote {
        string candidate;
        string electionId;
    }

    struct Candidate {
        string name;
        string demkhong; // constituency
    }

    // =======================
    // Storage
    // =======================
    mapping(string => mapping(string => bool)) private hasVoted; // electionId => uid => voted?
    mapping(string => mapping(string => uint256)) private voteCount; // electionId => candidate => votes
    mapping(string => Vote) private votes; // uid => Vote

    string[] private electionIds;
    mapping(string => bool) private electionExists;
    mapping(string => bool) private electionEnded;

    mapping(string => string[]) private candidatesPerElection; // electionId => candidate list
    mapping(string => mapping(string => bool)) private isCandidateTracked; // electionId => candidate => exists
    mapping(string => mapping(string => Candidate)) private candidateDetails; // electionId => candidate => Candidate

    // Track unique demkhongs per election for fast constituency summaries
    mapping(string => string[]) private demkhongsPerElection; // electionId => demkhong list
    mapping(string => mapping(string => bool)) private isDemkhongTracked; // electionId => demkhong => exists

    // Gender + demkhong aggregates
    mapping(string => mapping(Gender => uint256)) private genderVoteCount; // electionId => gender => total
    mapping(string => mapping(string => uint256)) private demkhongVotes; // electionId => demkhong => total votes
    mapping(string => mapping(string => mapping(Gender => uint256)))
        private demkhongGenderVoteCount;
    // electionId => demkhong => gender => total

    // =======================
    // Events
    // =======================
    event VoteCast(string indexed electionId, string indexed uid);
    event CandidateRegistered(
        string indexed electionId,
        string indexed candidate,
        string demkhong
    );
    event CandidateRemoved(string indexed electionId, string indexed candidate);
    event ElectionEnded(string indexed electionId);

    // =======================
    // Modifiers
    // =======================
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // =======================
    // Helper: convert string -> Gender
    // =======================
    function _stringToGender(
        string memory genderStr
    ) internal pure returns (Gender) {
        bytes32 hash = keccak256(abi.encodePacked(genderStr));
        if (hash == keccak256(abi.encodePacked("Male"))) {
            return Gender.Male;
        } else if (hash == keccak256(abi.encodePacked("Female"))) {
            return Gender.Female;
        } else {
            revert("Invalid gender string. Use 'Male' or 'Female'");
        }
    }

    // =======================
    // Admin: Candidates / Elections
    // =======================
    function registerCandidate(
        string memory electionId,
        string memory candidate,
        string memory demkhong
    ) public onlyOwner {
        require(
            !isCandidateTracked[electionId][candidate],
            "Candidate already registered"
        );

        if (!electionExists[electionId]) {
            electionExists[electionId] = true;
            electionIds.push(electionId);
        }

        // Track candidate
        isCandidateTracked[electionId][candidate] = true;
        candidatesPerElection[electionId].push(candidate);
        candidateDetails[electionId][candidate] = Candidate(
            candidate,
            demkhong
        );

        // Track demkhong (unique per election)
        if (!isDemkhongTracked[electionId][demkhong]) {
            isDemkhongTracked[electionId][demkhong] = true;
            demkhongsPerElection[electionId].push(demkhong);
        }

        emit CandidateRegistered(electionId, candidate, demkhong);
    }

    function removeCandidate(
        string memory electionId,
        string memory candidate
    ) public onlyOwner {
        require(electionExists[electionId], "Election does not exist");
        require(
            isCandidateTracked[electionId][candidate],
            "Candidate not registered"
        );

        // Remove from tracking
        isCandidateTracked[electionId][candidate] = false;
        voteCount[electionId][candidate] = 0;

        // Remove from array
        string[] storage candidates = candidatesPerElection[electionId];
        for (uint i = 0; i < candidates.length; i++) {
            if (
                keccak256(bytes(candidates[i])) == keccak256(bytes(candidate))
            ) {
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

    // =======================
    // Voting
    // =======================
    function vote(
        string memory electionId,
        string memory uid,
        string memory candidate,
        string memory genderStr
    ) public onlyOwner {
        require(electionExists[electionId], "Election does not exist");
        require(
            isCandidateTracked[electionId][candidate],
            "Candidate not registered"
        );
        require(!hasVoted[electionId][uid], "Already voted in this election");

        Gender gender = _stringToGender(genderStr);

        votes[uid] = Vote(candidate, electionId);
        hasVoted[electionId][uid] = true;
        voteCount[electionId][candidate] += 1;

        // Update aggregates
        genderVoteCount[electionId][gender] += 1;

        string memory demkhong = candidateDetails[electionId][candidate]
            .demkhong;
        demkhongVotes[electionId][demkhong] += 1;
        demkhongGenderVoteCount[electionId][demkhong][gender] += 1;

        emit VoteCast(electionId, uid);
    }

    // =======================
    // Getters
    // =======================

    function getCandidateVotesAndTotalElectionVotes(
        string memory electionId
    )
        public
        view
        onlyOwner
        returns (
            string[] memory candidates,
            string[] memory demkhongs,
            uint256[] memory candidateVotes,
            uint256 totalVotes,
            uint256 totalMale,
            uint256 totalFemale
        )
    {
        require(electionExists[electionId], "Election ID does not exist");

        candidates = candidatesPerElection[electionId];
        demkhongs = new string[](candidates.length);
        candidateVotes = new uint256[](candidates.length);
        totalVotes = 0;

        for (uint i = 0; i < candidates.length; i++) {
            candidateVotes[i] = voteCount[electionId][candidates[i]];
            demkhongs[i] = candidateDetails[electionId][candidates[i]].demkhong;
            totalVotes += candidateVotes[i];
        }

        totalMale = genderVoteCount[electionId][Gender.Male];
        totalFemale = genderVoteCount[electionId][Gender.Female];
    }

    function getDemkhongResults(
        string memory electionId
    )
        public
        view
        onlyOwner
        returns (
            string[] memory demkhongs,
            uint256[] memory totalVotesByDemkhong,
            uint256[] memory maleByDemkhong,
            uint256[] memory femaleByDemkhong
        )
    {
        require(electionExists[electionId], "Election does not exist");

        demkhongs = demkhongsPerElection[electionId];
        uint256 len = demkhongs.length;

        totalVotesByDemkhong = new uint256[](len);
        maleByDemkhong = new uint256[](len);
        femaleByDemkhong = new uint256[](len);

        for (uint i = 0; i < len; i++) {
            string memory d = demkhongs[i];
            totalVotesByDemkhong[i] = demkhongVotes[electionId][d];
            maleByDemkhong[i] = demkhongGenderVoteCount[electionId][d][
                Gender.Male
            ];
            femaleByDemkhong[i] = demkhongGenderVoteCount[electionId][d][
                Gender.Female
            ];
        }
    }

    function getAllElections() public view onlyOwner returns (string[] memory) {
        return electionIds;
    }

    function hasUserVoted(
        string memory electionId,
        string memory uid
    ) public view onlyOwner returns (bool) {
        return hasVoted[electionId][uid];
    }

    function isElectionEnded(
        string memory electionId
    ) public view returns (bool) {
        return electionEnded[electionId];
    }
}
