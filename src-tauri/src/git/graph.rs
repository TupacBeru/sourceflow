//! Commit graph lane assignment.
//!
//! Given a list of commits already sorted newest-first (the same order the
//! frontend renders), we annotate each one with:
//! - the lane its dot lives in
//! - the color of that lane
//! - the state of all active lanes in the gap directly below the commit
//! - fork edges (this commit -> a different lane in the next row)
//! - merge-in edges (a different lane in the previous row -> this commit)
//!
//! The algorithm is a single linear pass that tracks which SHA each lane is
//! currently "waiting for" (i.e. the parent commit it expects to reach next).
//! When that commit shows up we consume the lane; merge commits fork off new
//! lanes for their additional parents.

use std::collections::HashMap;

use super::types::{CommitInfo, GraphEdge};

const PALETTE_SIZE: u32 = 8;

#[derive(Debug, Clone, Copy)]
struct LaneSlot {
    color: u32,
}

/// Walk `commits` newest-first and fill in the graph fields on each entry.
///
/// The fields default to empty when the input is empty - callers must not rely
/// on graph data being meaningful for partial / unsorted lists.
pub fn assign_lanes(commits: &mut [CommitInfo]) {
    // active_lanes[i] = Some(slot) means lane i is alive and waiting for a parent.
    // None slots are reusable.
    let mut active: Vec<Option<LaneSlot>> = Vec::new();
    // sha -> indices into `active` that are currently waiting for that sha.
    let mut waiting: HashMap<String, Vec<usize>> = HashMap::new();
    let mut next_color: u32 = 0;

    for commit in commits.iter_mut() {
        // 1. Which existing lanes were expecting this commit?
        let mut waiting_lanes = waiting.remove(&commit.sha).unwrap_or_default();
        waiting_lanes.sort_unstable();

        // 2. Pick this commit's lane (leftmost waiter, or a fresh lane).
        let (my_lane, my_color) = if let Some(&first) = waiting_lanes.first() {
            let color = active[first].expect("waiting lane must be alive").color;
            (first, color)
        } else {
            let lane = allocate_lane(&mut active);
            let color = next_color;
            next_color = (next_color + 1) % PALETTE_SIZE;
            active[lane] = Some(LaneSlot { color });
            (lane, color)
        };

        // 3. Any other waiters merge into my_lane - free those slots and record
        //    the diagonal lines.
        let mut merge_in_edges = Vec::new();
        for &lane in waiting_lanes.iter().skip(1) {
            if lane == my_lane {
                continue;
            }
            if let Some(slot) = active[lane].take() {
                merge_in_edges.push(GraphEdge {
                    lane: lane as u32,
                    color: slot.color,
                });
            }
        }

        // 4. Clear my own slot - it will be repopulated by the first parent (or
        //    left empty for root commits).
        active[my_lane] = None;

        // 5. Place each parent.
        let mut fork_edges = Vec::new();
        for (idx, parent) in commit.parents.iter().enumerate() {
            if idx == 0 {
                // First parent inherits the lane and color.
                active[my_lane] = Some(LaneSlot { color: my_color });
                waiting.entry(parent.clone()).or_default().push(my_lane);
            } else {
                // Additional parent: if some other lane is already waiting for
                // it, just draw a fork edge to that lane (the two histories
                // converge). Otherwise allocate a new lane.
                let existing = waiting
                    .get(parent)
                    .and_then(|v| v.first().copied())
                    .filter(|&l| active[l].is_some());
                if let Some(lane) = existing {
                    let color = active[lane]
                        .expect("existing waiting lane must be alive")
                        .color;
                    fork_edges.push(GraphEdge {
                        lane: lane as u32,
                        color,
                    });
                } else {
                    let lane = allocate_lane(&mut active);
                    let color = next_color;
                    next_color = (next_color + 1) % PALETTE_SIZE;
                    active[lane] = Some(LaneSlot { color });
                    waiting.entry(parent.clone()).or_default().push(lane);
                    fork_edges.push(GraphEdge {
                        lane: lane as u32,
                        color,
                    });
                }
            }
        }

        // 6. Compact trailing dead lanes so we don't drag a tail of Nones
        //    through every row.
        while matches!(active.last(), Some(None)) {
            active.pop();
        }

        commit.lane = my_lane as u32;
        commit.color = my_color;
        commit.lanes_after = active.iter().map(|s| s.map(|x| x.color)).collect();
        commit.fork_edges = fork_edges;
        commit.merge_in_edges = merge_in_edges;
    }
}

/// First free index, growing `active` by one slot if needed.
fn allocate_lane(active: &mut Vec<Option<LaneSlot>>) -> usize {
    if let Some(idx) = active.iter().position(Option::is_none) {
        idx
    } else {
        active.push(None);
        active.len() - 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commit(sha: &str, parents: &[&str]) -> CommitInfo {
        CommitInfo {
            sha: sha.into(),
            short_sha: sha.into(),
            summary: String::new(),
            body: String::new(),
            author_name: String::new(),
            author_email: String::new(),
            timestamp: 0,
            parents: parents.iter().map(|s| (*s).into()).collect(),
            refs: vec![],
            lane: 0,
            color: 0,
            lanes_after: vec![],
            fork_edges: vec![],
            merge_in_edges: vec![],
        }
    }

    #[test]
    fn linear_history_stays_in_lane_zero() {
        let mut commits = vec![
            commit("c3", &["c2"]),
            commit("c2", &["c1"]),
            commit("c1", &[]),
        ];
        assign_lanes(&mut commits);
        assert!(commits.iter().all(|c| c.lane == 0));
        assert!(commits.iter().all(|c| c.color == 0));
        // Root commit closes the last lane.
        assert!(commits.last().unwrap().lanes_after.is_empty());
    }

    #[test]
    fn merge_commit_pulls_branch_back_to_main() {
        // Graph (newest first):
        //   M ─┐  merge commit, parents = [A, B]
        //   │  B
        //   A  │
        //   └──R  shared root
        let mut commits = vec![
            commit("M", &["A", "B"]),
            commit("B", &["R"]),
            commit("A", &["R"]),
            commit("R", &[]),
        ];
        assign_lanes(&mut commits);
        assert_eq!(commits[0].lane, 0);
        // Lane 0 expects A, lane 1 expects B - so B's commit is in lane 1.
        assert_eq!(commits[1].lane, 1);
        assert_eq!(commits[2].lane, 0);
        // Root: B's lane should have merged back into A's lane.
        assert_eq!(commits[3].lane, 0);
        // At the root, no lanes remain.
        assert!(commits[3].lanes_after.is_empty());
        // R is reached from two different lanes, so the second one merges in.
        assert_eq!(commits[3].merge_in_edges.len(), 1);
    }

    #[test]
    fn side_branch_forks_into_new_lane() {
        // Two heads, then they diverge into separate ancestors:
        //   A (parents R1)
        //   B (parents R2)
        //   R1
        //   R2
        let mut commits = vec![
            commit("A", &["R1"]),
            commit("B", &["R2"]),
            commit("R1", &[]),
            commit("R2", &[]),
        ];
        assign_lanes(&mut commits);
        assert_eq!(commits[0].lane, 0);
        // B is a fresh root, so it gets its own lane.
        assert_eq!(commits[1].lane, 1);
        assert_eq!(commits[2].lane, 0);
        assert_eq!(commits[3].lane, 1);
    }
}
