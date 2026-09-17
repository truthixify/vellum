#![no_std]

extern crate alloc;

#[allow(
    clippy::all,
    dead_code,
    mismatched_lifetime_syntaxes,
    redundant_semicolons,
    unused_imports
)]
pub mod entity {
    include!(concat!(env!("OUT_DIR"), "/entity/claim.rs"));
}

#[allow(
    clippy::all,
    dead_code,
    mismatched_lifetime_syntaxes,
    redundant_semicolons,
    unused_imports
)]
pub mod lazy {
    include!(concat!(env!("OUT_DIR"), "/lazy/claim.rs"));
}

pub const CLAIM_TYPE_ARGS_LEN: usize = 65;
pub const DID_LOCK_ARGS_LEN: usize = 32;
pub const MAX_CLAIM_DATA_SIZE: usize = 16 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ParsedClaim {
    pub issuer_id: [u8; 20],
    pub nonce: [u8; 32],
    pub issued_at: u64,
    pub expires_at: Option<u64>,
    pub payload_len: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ParseError {
    TooLarge,
    Molecule,
    InvalidVersion,
    EmptyPayload,
    InvalidIssuedAt,
    InvalidExpiry,
}

pub fn parse_claim(data: &[u8]) -> Result<ParsedClaim, ParseError> {
    if data.len() > MAX_CLAIM_DATA_SIZE {
        return Err(ParseError::TooLarge);
    }

    let cursor: molecule::lazy_reader::Cursor = data.to_vec().into();
    let value = lazy::ClaimData::try_from(cursor).map_err(|_| ParseError::InvalidVersion)?;
    value.verify(false).map_err(|_| ParseError::Molecule)?;

    let lazy::ClaimData::ClaimV1(value) = value;
    let issued_at_field = value
        .cursor
        .table_slice_by_index(2)
        .map_err(|_| ParseError::Molecule)?;
    lazy::Uint64::from(issued_at_field)
        .verify(false)
        .map_err(|_| ParseError::Molecule)?;

    let expires_at_field = value
        .cursor
        .table_slice_by_index(3)
        .map_err(|_| ParseError::Molecule)?;
    if !expires_at_field.option_is_none() {
        lazy::Uint64::from(expires_at_field)
            .verify(false)
            .map_err(|_| ParseError::Molecule)?;
    }

    let payload_field = value
        .cursor
        .table_slice_by_index(4)
        .map_err(|_| ParseError::Molecule)?;
    lazy::Bytes::from(payload_field)
        .verify(false)
        .map_err(|_| ParseError::Molecule)?;

    let issuer_id = value.issuer_id().map_err(|_| ParseError::Molecule)?;
    let nonce = value.nonce().map_err(|_| ParseError::Molecule)?;
    let issued_at = value.issued_at().map_err(|_| ParseError::Molecule)?;
    let expires_at = value.expires_at().map_err(|_| ParseError::Molecule)?;
    let payload_len = value.payload().map_err(|_| ParseError::Molecule)?.size;

    if payload_len == 0 {
        return Err(ParseError::EmptyPayload);
    }
    if issued_at == 0 {
        return Err(ParseError::InvalidIssuedAt);
    }
    if expires_at.is_some_and(|expires_at| expires_at <= issued_at) {
        return Err(ParseError::InvalidExpiry);
    }

    Ok(ParsedClaim {
        issuer_id,
        nonce,
        issued_at,
        expires_at,
        payload_len,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::{vec, vec::Vec};
    use core::convert::TryInto;
    use molecule::prelude::{Builder, Entity};

    fn encoded_claim(issued_at: u64, expires_at: Option<u64>, payload: &[u8]) -> Vec<u8> {
        let mut payload_builder = entity::Bytes::new_builder();
        for byte in payload {
            payload_builder = payload_builder.push(*byte);
        }

        let expires_at: entity::Uint64Opt = expires_at
            .map(|value| entity::Uint64::from(value.to_le_bytes()).into())
            .unwrap_or_default();
        let value = entity::ClaimV1::new_builder()
            .issuer_id([1u8; 20])
            .nonce([2u8; 32])
            .issued_at(issued_at.to_le_bytes())
            .expires_at(expires_at)
            .payload(payload_builder.build())
            .build();
        let value: entity::ClaimData = value.into();
        value.as_slice().to_vec()
    }

    fn append_table_field_byte(mut data: Vec<u8>, field_index: usize) -> Vec<u8> {
        assert!(field_index < 5);
        let table_start = 4;
        let next_offset = if field_index + 1 < 5 {
            let position = 8 + (field_index + 1) * 4;
            u32::from_le_bytes(data[position..position + 4].try_into().unwrap()) as usize
        } else {
            let position = table_start;
            u32::from_le_bytes(data[position..position + 4].try_into().unwrap()) as usize
        };
        data.insert(table_start + next_offset, 0);

        let total_size =
            u32::from_le_bytes(data[table_start..table_start + 4].try_into().unwrap()) + 1;
        data[table_start..table_start + 4].copy_from_slice(&total_size.to_le_bytes());
        for index in (field_index + 1)..5 {
            let position = 8 + index * 4;
            let offset = u32::from_le_bytes(data[position..position + 4].try_into().unwrap()) + 1;
            data[position..position + 4].copy_from_slice(&offset.to_le_bytes());
        }
        data
    }

    #[test]
    fn parses_valid_claim() {
        let data = encoded_claim(10, Some(20), &[0x01]);
        let parsed = parse_claim(&data).expect("valid claim");

        assert_eq!(parsed.issuer_id, [1u8; 20]);
        assert_eq!(parsed.nonce, [2u8; 32]);
        assert_eq!(parsed.issued_at, 10);
        assert_eq!(parsed.expires_at, Some(20));
        assert_eq!(parsed.payload_len, 1);
    }

    #[test]
    fn rejects_invalid_time_and_payload() {
        assert_eq!(
            parse_claim(&encoded_claim(0, None, &[1])),
            Err(ParseError::InvalidIssuedAt)
        );
        assert_eq!(
            parse_claim(&encoded_claim(10, Some(10), &[1])),
            Err(ParseError::InvalidExpiry)
        );
        assert_eq!(
            parse_claim(&encoded_claim(10, None, &[])),
            Err(ParseError::EmptyPayload)
        );
    }

    #[test]
    fn rejects_trailing_bytes_and_oversized_data() {
        let mut trailing = encoded_claim(10, None, &[1]);
        trailing.push(0);
        assert_eq!(parse_claim(&trailing), Err(ParseError::Molecule));

        let oversized = vec![0u8; MAX_CLAIM_DATA_SIZE + 1];
        assert_eq!(parse_claim(&oversized), Err(ParseError::TooLarge));
    }

    #[test]
    fn rejects_trailing_bytes_in_nested_fields() {
        let cases = [
            append_table_field_byte(encoded_claim(10, None, &[1]), 2),
            append_table_field_byte(encoded_claim(10, Some(20), &[1]), 3),
            append_table_field_byte(encoded_claim(10, None, &[1]), 4),
        ];

        for data in cases {
            assert_eq!(parse_claim(&data), Err(ParseError::Molecule));
        }
    }
}
