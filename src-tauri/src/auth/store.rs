//! GitHub token storage backed by the OS keyring.
//!
//! On Linux this uses the Secret Service D-Bus API, which both KWallet
//! (KDE) and GNOME Keyring implement transparently. The user sees a
//! single keyring-unlock prompt the first time per session and then
//! silent access after that.

use keyring::Entry;

use crate::error::AppResult;

const SERVICE: &str = "sourceflow";
const USER: &str = "github_token";

fn entry() -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, USER)?)
}

pub fn save_github_token(token: &str) -> AppResult<()> {
    entry()?.set_password(token)?;
    Ok(())
}

pub fn load_github_token() -> AppResult<Option<String>> {
    match entry()?.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete_github_token() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
