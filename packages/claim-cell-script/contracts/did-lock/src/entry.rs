extern crate alloc;

use alloc::vec::Vec;

use crate::error::Error;
use ckb_std::{
    ckb_constants::Source,
    ckb_types::packed::Script,
    high_level::{
        load_cell_lock, load_cell_lock_hash, load_cell_type_hash, load_script, QueryIter,
    },
};
use vellum_claim_types::DID_LOCK_ARGS_LEN;

struct IdentityState {
    controller: Script,
    controller_hash: [u8; 32],
}

pub fn run() -> Result<(), Error> {
    let did_lock = load_script()?;
    let args = did_lock.args();
    if did_lock.has_extra_fields() || args.len() != DID_LOCK_ARGS_LEN {
        return Err(Error::InvalidArguments);
    }

    let identity_type_hash: [u8; 32] = args
        .raw_data()
        .as_ref()
        .try_into()
        .map_err(|_| Error::InvalidArguments)?;
    let matching_inputs = matching_identity_states(Source::Input, &identity_type_hash)?;
    let identity = if matching_inputs.is_empty() {
        let matching_deps = matching_identity_states(Source::CellDep, &identity_type_hash)?;
        match matching_deps.len() {
            0 => return Err(Error::MissingIdentity),
            1 => matching_deps.into_iter().next().unwrap(),
            _ => return Err(Error::AmbiguousIdentity),
        }
    } else {
        match matching_inputs.len() {
            1 => matching_inputs.into_iter().next().unwrap(),
            _ => return Err(Error::AmbiguousIdentity),
        }
    };

    if same_code_and_hash_type(&identity.controller, &did_lock) {
        return Err(Error::RecursiveController);
    }

    let authorized = QueryIter::new(load_cell_lock_hash, Source::Input)
        .any(|lock_hash| lock_hash == identity.controller_hash);
    if authorized {
        Ok(())
    } else {
        Err(Error::UnauthorizedController)
    }
}

fn matching_identity_states(
    source: Source,
    identity_type_hash: &[u8; 32],
) -> Result<Vec<IdentityState>, Error> {
    let mut states = Vec::new();
    for (index, maybe_type_hash) in QueryIter::new(load_cell_type_hash, source).enumerate() {
        let Some(type_hash) = maybe_type_hash else {
            continue;
        };
        if type_hash != *identity_type_hash {
            continue;
        }

        let controller = load_cell_lock(index, source)?;
        let controller_hash = load_cell_lock_hash(index, source)?;
        states.push(IdentityState {
            controller,
            controller_hash,
        });
    }
    Ok(states)
}

fn same_code_and_hash_type(left: &Script, right: &Script) -> bool {
    left.code_hash() == right.code_hash() && left.hash_type() == right.hash_type()
}
