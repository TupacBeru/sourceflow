//! Git operations module.
//!
//! All `git2::Repository` interaction is encapsulated here so commands stay
//! thin and the libgit2 dependency does not leak into the rest of the crate.

pub mod credentials;
pub mod refs;
pub mod remote;
pub mod repo;
pub mod stage;
pub mod types;
