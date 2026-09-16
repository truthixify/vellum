extern crate alloc;

use alloc::{vec, vec::Vec};

use crate::error::Error;
use ckb_hash::blake2b_256;
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{core::ScriptHashType, packed::Script, prelude::*},
    error::SysError,
    high_level::{
        load_cell_lock, load_cell_lock_hash, load_cell_type, load_script, load_script_hash,
        QueryIter,
    },
    syscalls,
};
use vellum_claim_types::{parse_claim, CLAIM_TYPE_ARGS_LEN, MAX_CLAIM_DATA_SIZE};

const CLAIM_ID_DOMAIN: &[u8; 16] = b"VELLUM_CLAIM_V1\0";

pub fn run() -> Result<(), Error> {
    if !has_cell(Source::GroupOutput)? {
        return Ok(());
    }

    let claim_type = load_script()?;
    let args = claim_type.args();
    if claim_type.has_extra_fields() || args.len() != CLAIM_TYPE_ARGS_LEN {
        return Err(Error::InvalidArguments);
    }

    let args = args.raw_data();
    let mut issuer_code_hash = [0u8; 32];
    issuer_code_hash.copy_from_slice(&args[..32]);
    let issuer_hash_type = args[32];
    if !ScriptHashType::verify_value(issuer_hash_type) {
        return Err(Error::InvalidArguments);
    }

    let claim_type_hash = load_script_hash()?;
    let mut claim_ids = Vec::new();

    for (index, data) in group_output_data()?.into_iter().enumerate() {
        let claim = parse_claim(&data).map_err(|_| Error::InvalidClaim)?;
        authorize_issuer(&issuer_code_hash, issuer_hash_type, &claim.issuer_id)?;

        let subject_lock = load_cell_lock(index, Source::GroupOutput)?;
        let claim_id = claim_id(claim_type_hash, &subject_lock, &data);
        if claim_ids.contains(&claim_id) {
            return Err(Error::DuplicateClaim);
        }
        claim_ids.push(claim_id);
    }

    Ok(())
}

fn has_cell(source: Source) -> Result<bool, Error> {
    let mut buffer = [];
    match syscalls::load_cell(&mut buffer, 0, 0, source) {
        Ok(_) | Err(SysError::LengthNotEnough(_)) => Ok(true),
        Err(SysError::IndexOutOfBound) => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn group_output_data() -> Result<Vec<Vec<u8>>, Error> {
    let mut data = Vec::new();
    for index in 0.. {
        match bounded_cell_data(index, Source::GroupOutput) {
            Ok(value) => data.push(value),
            Err(Error::Syscall(SysError::IndexOutOfBound)) => break,
            Err(error) => return Err(error),
        }
    }
    Ok(data)
}

fn bounded_cell_data(index: usize, source: Source) -> Result<Vec<u8>, Error> {
    let mut probe = [0u8; 1];
    let size = match syscalls::load_cell_data(&mut probe, 0, index, source) {
        Ok(size) => size,
        Err(SysError::LengthNotEnough(size)) => size,
        Err(error) => return Err(error.into()),
    };
    if size > MAX_CLAIM_DATA_SIZE {
        return Err(Error::InvalidClaim);
    }
    if size == 0 {
        return Ok(Vec::new());
    }

    let mut data = vec![0u8; size];
    let loaded = syscalls::load_cell_data(&mut data, 0, index, source)?;
    if loaded != size {
        return Err(Error::InvalidClaim);
    }
    Ok(data)
}

fn script_matches(script: &Script, code_hash: &[u8; 32], hash_type: u8, args: &[u8]) -> bool {
    !script.has_extra_fields()
        && script.code_hash().as_slice() == code_hash
        && script.hash_type().as_slice() == [hash_type]
        && script.args().raw_data().as_ref() == args
}

fn matching_lock_hashes(
    source: Source,
    code_hash: &[u8; 32],
    hash_type: u8,
    issuer_id: &[u8; 20],
) -> Result<Vec<[u8; 32]>, Error> {
    let mut locks = Vec::new();
    for (index, maybe_type) in QueryIter::new(load_cell_type, source).enumerate() {
        let Some(type_script) = maybe_type else {
            continue;
        };
        if script_matches(&type_script, code_hash, hash_type, issuer_id) {
            locks.push(load_cell_lock_hash(index, source)?);
        }
    }
    Ok(locks)
}

fn authorize_issuer(
    code_hash: &[u8; 32],
    hash_type: u8,
    issuer_id: &[u8; 20],
) -> Result<(), Error> {
    let input_locks = matching_lock_hashes(Source::Input, code_hash, hash_type, issuer_id)?;
    let output_locks = matching_lock_hashes(Source::Output, code_hash, hash_type, issuer_id)?;
    let dep_locks = matching_lock_hashes(Source::CellDep, code_hash, hash_type, issuer_id)?;

    let controller_lock = match (input_locks.len(), output_locks.len(), dep_locks.len()) {
        (1, 1, _) => input_locks[0],
        (0, 0, 1) => dep_locks[0],
        (0, 1, 0) => output_locks[0],
        (0, 0, 0) => return Err(Error::MissingIssuer),
        _ => return Err(Error::AmbiguousIssuer),
    };

    let authorized = QueryIter::new(load_cell_lock_hash, Source::Input)
        .any(|lock_hash| lock_hash == controller_lock);
    if authorized {
        Ok(())
    } else {
        Err(Error::UnauthorizedIssuer)
    }
}

fn claim_id(claim_type_hash: [u8; 32], subject_lock: &Script, data: &[u8]) -> [u8; 32] {
    let subject_lock_hash = blake2b_256(subject_lock.as_slice());
    let mut preimage = Vec::with_capacity(CLAIM_ID_DOMAIN.len() + 64 + data.len());
    preimage.extend_from_slice(CLAIM_ID_DOMAIN);
    preimage.extend_from_slice(&claim_type_hash);
    preimage.extend_from_slice(&subject_lock_hash);
    preimage.extend_from_slice(data);
    blake2b_256(preimage)
}
