use std::{fs, path::PathBuf, sync::Mutex};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use webauthn_rs::prelude::{CredentialID, Passkey};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PasskeyData {
    pub(crate) user_id: Uuid,
    #[serde(default)]
    pub(crate) credentials: Vec<Passkey>,
}

pub(crate) struct PasskeyStore {
    path: PathBuf,
    data: Mutex<PasskeyData>,
}

impl PasskeyStore {
    pub(crate) fn load(path: PathBuf) -> Result<Self> {
        let data = if path.exists() {
            let raw = fs::read_to_string(&path)
                .with_context(|| format!("read passkey store {}", path.display()))?;
            serde_json::from_str(&raw)
                .with_context(|| format!("parse passkey store {}", path.display()))?
        } else {
            PasskeyData {
                user_id: Uuid::new_v4(),
                credentials: Vec::new(),
            }
        };
        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }

    pub(crate) fn user_id(&self) -> Uuid {
        self.data
            .lock()
            .expect("passkey store lock poisoned")
            .user_id
    }

    pub(crate) fn credentials(&self) -> Vec<Passkey> {
        self.data
            .lock()
            .expect("passkey store lock poisoned")
            .credentials
            .clone()
    }

    pub(crate) fn credential_ids(&self) -> Vec<CredentialID> {
        self.data
            .lock()
            .expect("passkey store lock poisoned")
            .credentials
            .iter()
            .map(|credential| credential.cred_id().clone())
            .collect()
    }

    pub(crate) fn add_credential(&self, passkey: Passkey) -> Result<()> {
        {
            let mut data = self.data.lock().expect("passkey store lock poisoned");
            if !data
                .credentials
                .iter()
                .any(|existing| existing.cred_id() == passkey.cred_id())
            {
                data.credentials.push(passkey);
            }
        }
        self.save()
    }

    pub(crate) fn update_credential(
        &self,
        result: &webauthn_rs::prelude::AuthenticationResult,
    ) -> Result<()> {
        let mut changed = false;
        {
            let mut data = self.data.lock().expect("passkey store lock poisoned");
            for credential in &mut data.credentials {
                if credential.update_credential(result).unwrap_or(false) {
                    changed = true;
                }
            }
        }
        if changed {
            self.save()?;
        }
        Ok(())
    }

    fn save(&self) -> Result<()> {
        if let Some(parent) = self.path.parent()
            && !parent.as_os_str().is_empty()
        {
            fs::create_dir_all(parent)
                .with_context(|| format!("create passkey store dir {}", parent.display()))?;
        }
        let data = self.data.lock().expect("passkey store lock poisoned");
        let raw = serde_json::to_string_pretty(&*data).context("serialize passkey store")?;
        fs::write(&self.path, raw)
            .with_context(|| format!("write passkey store {}", self.path.display()))
    }
}
