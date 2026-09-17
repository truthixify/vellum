#![cfg_attr(not(test), allow(dead_code, unused_imports))]

use std::{convert::TryInto, env, fs, path::PathBuf};

use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{DepType, ScriptHashType, TransactionBuilder},
        packed::{CellDep, CellInput, CellOutput, OutPoint, Script},
        prelude::*,
    },
    context::Context,
};
use molecule::prelude::{Builder, Entity};
use vellum_claim_types::entity;

const MAX_CYCLES: u64 = 10_000_000;

struct TestContext {
    context: Context,
    always_success: OutPoint,
    claim_cell: OutPoint,
    did_lock: OutPoint,
}

fn contract_bytes(name: &str) -> Bytes {
    let build_dir = env::var("VELLUM_BUILD_DIR").unwrap_or_else(|_| "build/release".to_owned());
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../")
        .join(build_dir)
        .join(name);
    fs::read(&path)
        .unwrap_or_else(|error| {
            panic!(
                "read {} (run `make build` first): {}",
                path.display(),
                error
            )
        })
        .into()
}

fn test_context() -> TestContext {
    let mut context = Context::new_with_deterministic_rng();
    let always_success = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let claim_cell = context.deploy_cell(contract_bytes("claim-cell"));
    let did_lock = context.deploy_cell(contract_bytes("did-lock"));
    TestContext {
        context,
        always_success,
        claim_cell,
        did_lock,
    }
}

fn always_lock(context: &mut Context, code: &OutPoint, args: u8) -> Script {
    context
        .build_script_with_hash_type(code, ScriptHashType::Data, Bytes::from(vec![args]))
        .expect("always-success script")
}

fn issuer_type(context: &mut Context, code: &OutPoint, issuer_id: [u8; 20]) -> Script {
    context
        .build_script_with_hash_type(code, ScriptHashType::Data, Bytes::from(issuer_id.to_vec()))
        .expect("issuer type script")
}

fn claim_type(
    context: &mut Context,
    code: &OutPoint,
    issuer_type: &Script,
    schema_hash: [u8; 32],
) -> Script {
    claim_type_with_hash_type(
        context,
        code,
        issuer_type,
        schema_hash,
        ScriptHashType::Type,
    )
}

fn claim_type_with_hash_type(
    context: &mut Context,
    code: &OutPoint,
    issuer_type: &Script,
    schema_hash: [u8; 32],
    hash_type: ScriptHashType,
) -> Script {
    let mut args = Vec::with_capacity(vellum_claim_types::CLAIM_TYPE_ARGS_LEN);
    args.extend_from_slice(issuer_type.code_hash().as_slice());
    args.push(issuer_type.hash_type().as_slice()[0]);
    args.extend_from_slice(&schema_hash);
    context
        .build_script_with_hash_type(code, hash_type, Bytes::from(args))
        .expect("claim type script")
}

fn claim_data(issuer_id: [u8; 20], issued_at: u64, expires_at: Option<u64>) -> Bytes {
    let payload = entity::Bytes::new_builder().push(0x01u8).build();
    let expires_at: entity::Uint64Opt = expires_at
        .map(|value| entity::Uint64::from(value.to_le_bytes()).into())
        .unwrap_or_default();
    let value = entity::ClaimV1::new_builder()
        .issuer_id(issuer_id)
        .nonce([3u8; 32])
        .issued_at(issued_at.to_le_bytes())
        .expires_at(expires_at)
        .payload(payload)
        .build();
    let value: entity::ClaimData = value.into();
    value.as_slice().to_vec().into()
}

fn claim_data_with_trailing_payload_byte(
    issuer_id: [u8; 20],
    issued_at: u64,
    expires_at: Option<u64>,
) -> Bytes {
    let mut data = claim_data(issuer_id, issued_at, expires_at).to_vec();
    let table_start = 4;
    let total_size = u32::from_le_bytes(data[table_start..table_start + 4].try_into().unwrap()) + 1;
    data.push(0);
    data[table_start..table_start + 4].copy_from_slice(&total_size.to_le_bytes());
    data.into()
}

fn did_output(capacity: u64, lock: Script, identity_type: Script) -> CellOutput {
    CellOutput::new_builder()
        .capacity(capacity)
        .lock(lock)
        .type_(Some(identity_type).pack())
        .build()
}

fn claim_output(capacity: u64, lock: Script, claim_type: Script) -> CellOutput {
    CellOutput::new_builder()
        .capacity(capacity)
        .lock(lock)
        .type_(Some(claim_type).pack())
        .build()
}

fn funding_cell(context: &mut Context, lock: Script, capacity: u64) -> OutPoint {
    context.create_cell(
        CellOutput::new_builder()
            .capacity(capacity)
            .lock(lock)
            .build(),
        Bytes::new(),
    )
}

fn verify(context: &Context, tx: &ckb_testtool::ckb_types::core::TransactionView) -> u64 {
    let cycles = context
        .verify_tx(tx, MAX_CYCLES)
        .expect("transaction should verify");
    println!("verified transaction: {cycles} cycles");
    cycles
}

#[test]
fn claim_creation_uses_issuer_controller_and_arbitrary_subject_lock() {
    let mut fixture = test_context();
    let issuer_id = [7u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x10);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x20);
    let claim_type = claim_type_with_hash_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
        ScriptHashType::Data1,
    );

    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 100_000);
    let claim_data = claim_data(issuer_id, 10, Some(20));
    let claim_cell_output = claim_output(100_000, subject_lock, claim_type);
    let replacement = did_output(100_000, controller_lock, issuer_type);
    let tx = TransactionBuilder::default()
        .cell_dep(
            CellDep::new_builder()
                .out_point(issuer_out_point.clone())
                .dep_type(DepType::Code)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(issuer_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(replacement)
        .output(claim_cell_output)
        .outputs_data([Bytes::new(), claim_data].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    verify(&fixture.context, &tx);
}

#[test]
fn claim_destruction_does_not_require_issuer_authorization() {
    let mut fixture = test_context();
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, [1u8; 20]);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x21);
    let claim_out_point = fixture.context.create_cell(
        claim_output(100_000, subject_lock.clone(), claim_type),
        claim_data([1u8; 20], 10, None),
    );
    let funding_out_point = funding_cell(&mut fixture.context, subject_lock.clone(), 100_000);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(claim_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(200_000u64)
                .lock(subject_lock)
                .build(),
        )
        .outputs_data([Bytes::new()].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    verify(&fixture.context, &tx);
}

#[test]
fn claim_accepts_live_issuer_from_cell_dep() {
    let mut fixture = test_context();
    let issuer_id = [2u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x22);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock, 200_000);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x23);
    let tx = TransactionBuilder::default()
        .cell_dep(
            CellDep::new_builder()
                .out_point(issuer_out_point)
                .dep_type(DepType::Code)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(claim_output(200_000, subject_lock, claim_type))
        .outputs_data([claim_data(issuer_id, 10, None)].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    verify(&fixture.context, &tx);
}

#[test]
fn claim_accepts_issuer_created_in_same_transaction() {
    let mut fixture = test_context();
    let issuer_id = [3u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x24);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 200_000);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x25);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(did_output(
            100_000,
            controller_lock.clone(),
            issuer_type.clone(),
        ))
        .output(claim_output(100_000, subject_lock, claim_type))
        .outputs_data([Bytes::new(), claim_data(issuer_id, 10, None)].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    verify(&fixture.context, &tx);
}

#[test]
fn claim_rejects_missing_controller_authorization() {
    let mut fixture = test_context();
    let issuer_id = [8u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let issuer_controller = always_lock(&mut fixture.context, &fixture.always_success, 0x11);
    let unrelated_controller = always_lock(&mut fixture.context, &fixture.always_success, 0x12);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, issuer_controller, issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point =
        funding_cell(&mut fixture.context, unrelated_controller.clone(), 100_000);
    let claim_output = CellOutput::new_builder()
        .capacity(100_000u64)
        .lock(unrelated_controller.clone())
        .type_(Some(claim_type).pack())
        .build();
    let tx = TransactionBuilder::default()
        .cell_dep(
            CellDep::new_builder()
                .out_point(issuer_out_point)
                .dep_type(DepType::Code)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(claim_output)
        .outputs_data([claim_data(issuer_id, 10, None)].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn claim_rejects_deactivated_issuer() {
    let mut fixture = test_context();
    let issuer_id = [15u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x48);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 100_000);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x49);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(issuer_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(claim_output(100_000, subject_lock, claim_type))
        .outputs_data([claim_data(issuer_id, 10, None)].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn claim_rejects_missing_issuer_state() {
    let mut fixture = test_context();
    let issuer_id = [16u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let funding_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x4b);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let funding_out_point = funding_cell(&mut fixture.context, funding_lock, 100_000);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x4c);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(claim_output(100_000, subject_lock, claim_type))
        .outputs_data([claim_data(issuer_id, 10, None)].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn claim_rejects_ambiguous_issuer_states() {
    let mut fixture = test_context();
    let issuer_id = [6u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x26);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 300_000);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x27);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(did_output(
            100_000,
            controller_lock.clone(),
            issuer_type.clone(),
        ))
        .output(did_output(100_000, controller_lock, issuer_type))
        .output(claim_output(100_000, subject_lock, claim_type))
        .outputs_data([Bytes::new(), Bytes::new(), claim_data(issuer_id, 10, None)].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn claim_rejects_duplicate_claim_ids() {
    let mut fixture = test_context();
    let issuer_id = [10u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x28);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x29);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 200_000);
    let data = claim_data(issuer_id, 10, None);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(issuer_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(did_output(100_000, controller_lock, issuer_type))
        .output(claim_output(
            100_000,
            subject_lock.clone(),
            claim_type.clone(),
        ))
        .output(claim_output(100_000, subject_lock, claim_type))
        .outputs_data([Bytes::new(), data.clone(), data].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn claim_rejects_wrong_type_argument_length() {
    let mut fixture = test_context();
    let issuer_id = [11u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x2a);
    let mut args = Vec::with_capacity(vellum_claim_types::CLAIM_TYPE_ARGS_LEN + 1);
    args.extend_from_slice(issuer_type.code_hash().as_slice());
    args.push(3);
    args.extend_from_slice(&[9u8; 32]);
    args.push(0);
    let claim_type = fixture
        .context
        .build_script(&fixture.claim_cell, args.into())
        .expect("claim type script");
    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 100_000);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x2b);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(issuer_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(did_output(100_000, controller_lock, issuer_type))
        .output(claim_output(100_000, subject_lock, claim_type))
        .outputs_data([Bytes::new(), claim_data(issuer_id, 10, None)].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn claim_rejects_unsupported_hash_type() {
    let mut fixture = test_context();
    let issuer_id = [14u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x46);
    let mut args = Vec::with_capacity(vellum_claim_types::CLAIM_TYPE_ARGS_LEN);
    args.extend_from_slice(issuer_type.code_hash().as_slice());
    args.push(3);
    args.extend_from_slice(&[9u8; 32]);
    let claim_type = fixture
        .context
        .build_script(&fixture.claim_cell, args.into())
        .expect("claim type script");
    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 100_000);
    let subject_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x47);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(issuer_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(did_output(100_000, controller_lock, issuer_type))
        .output(claim_output(100_000, subject_lock, claim_type))
        .outputs_data([Bytes::new(), claim_data(issuer_id, 10, None)].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn claim_rejects_malformed_and_expired_data() {
    let mut fixture = test_context();
    let issuer_id = [9u8; 20];
    let issuer_type = issuer_type(&mut fixture.context, &fixture.always_success, issuer_id);
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x13);
    let claim_type = claim_type(
        &mut fixture.context,
        &fixture.claim_cell,
        &issuer_type,
        [9u8; 32],
    );
    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 100_000);
    let claim_output = CellOutput::new_builder()
        .capacity(100_000u64)
        .lock(controller_lock.clone())
        .type_(Some(claim_type).pack())
        .build();
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(issuer_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(did_output(
            100_000,
            controller_lock.clone(),
            issuer_type.clone(),
        ))
        .output(claim_output.clone())
        .outputs_data([Bytes::new(), claim_data(issuer_id, 10, Some(10))].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);
    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());

    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 100_000);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(issuer_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(did_output(
            100_000,
            controller_lock.clone(),
            issuer_type.clone(),
        ))
        .output(claim_output.clone())
        .outputs_data(
            [
                Bytes::new(),
                claim_data_with_trailing_payload_byte(issuer_id, 10, None),
            ]
            .pack(),
        )
        .build();
    let tx = fixture.context.complete_tx(tx);
    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());

    let issuer_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), issuer_type.clone()),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 100_000);
    let oversized_data = Bytes::from(vec![0u8; vellum_claim_types::MAX_CLAIM_DATA_SIZE + 1]);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(issuer_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(did_output(100_000, controller_lock, issuer_type))
        .output(claim_output)
        .outputs_data([Bytes::new(), oversized_data].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);
    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn did_lock_follows_controller_and_rejects_unauthorized_spends() {
    let mut fixture = test_context();
    let identity_type = issuer_type(&mut fixture.context, &fixture.always_success, [4u8; 20]);
    let identity_type_hash = identity_type.calc_script_hash();
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x30);
    let did_lock = fixture
        .context
        .build_script(
            &fixture.did_lock,
            Bytes::from(identity_type_hash.as_slice().to_vec()),
        )
        .expect("DID Lock script");
    let identity_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), identity_type),
        Bytes::new(),
    );
    let subject_out_point = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000u64)
            .lock(did_lock)
            .build(),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock, 100_000);
    let identity_dep = CellDep::new_builder()
        .out_point(identity_out_point)
        .dep_type(DepType::Code)
        .build();
    let tx = TransactionBuilder::default()
        .cell_dep(identity_dep)
        .input(
            CellInput::new_builder()
                .previous_output(subject_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(200_000u64)
                .lock(always_lock(
                    &mut fixture.context,
                    &fixture.always_success,
                    0x31,
                ))
                .build(),
        )
        .outputs_data([Bytes::new()].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    verify(&fixture.context, &tx);
}

#[test]
fn did_lock_uses_identity_input_when_present() {
    let mut fixture = test_context();
    let identity_type = issuer_type(&mut fixture.context, &fixture.always_success, [12u8; 20]);
    let identity_type_hash = identity_type.calc_script_hash();
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x2c);
    let did_lock = fixture
        .context
        .build_script(
            &fixture.did_lock,
            Bytes::from(identity_type_hash.as_slice().to_vec()),
        )
        .expect("DID Lock script");
    let dep_controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x4a);
    let identity_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock.clone(), identity_type.clone()),
        Bytes::new(),
    );
    let dep_identity_out_point = fixture.context.create_cell(
        did_output(100_000, dep_controller_lock, identity_type),
        Bytes::new(),
    );
    let subject_out_point = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000u64)
            .lock(did_lock)
            .build(),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, controller_lock.clone(), 100_000);
    let tx = TransactionBuilder::default()
        .cell_dep(
            CellDep::new_builder()
                .out_point(dep_identity_out_point)
                .dep_type(DepType::Code)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(identity_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(subject_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(300_000u64)
                .lock(always_lock(
                    &mut fixture.context,
                    &fixture.always_success,
                    0x2d,
                ))
                .build(),
        )
        .outputs_data([Bytes::new()].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    verify(&fixture.context, &tx);
}

#[test]
fn did_lock_rejects_invalid_missing_and_ambiguous_identity_state() {
    let mut fixture = test_context();
    let invalid_did_lock = fixture
        .context
        .build_script(&fixture.did_lock, Bytes::from(vec![0u8; 31]))
        .expect("DID Lock script");
    let subject_out_point = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000u64)
            .lock(invalid_did_lock)
            .build(),
        Bytes::new(),
    );
    let funding_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x4d);
    let funding_out_point = funding_cell(&mut fixture.context, funding_lock, 100_000);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(subject_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(200_000u64)
                .lock(always_lock(
                    &mut fixture.context,
                    &fixture.always_success,
                    0x4e,
                ))
                .build(),
        )
        .outputs_data([Bytes::new()].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);
    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());

    let mut fixture = test_context();
    let identity_type = issuer_type(&mut fixture.context, &fixture.always_success, [17u8; 20]);
    let identity_type_hash = identity_type.calc_script_hash();
    let did_lock = fixture
        .context
        .build_script(
            &fixture.did_lock,
            Bytes::from(identity_type_hash.as_slice().to_vec()),
        )
        .expect("DID Lock script");
    let subject_out_point = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000u64)
            .lock(did_lock)
            .build(),
        Bytes::new(),
    );
    let funding_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x4f);
    let funding_out_point = funding_cell(&mut fixture.context, funding_lock, 100_000);
    let tx = TransactionBuilder::default()
        .input(
            CellInput::new_builder()
                .previous_output(subject_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(200_000u64)
                .lock(always_lock(
                    &mut fixture.context,
                    &fixture.always_success,
                    0x50,
                ))
                .build(),
        )
        .outputs_data([Bytes::new()].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);
    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());

    let mut fixture = test_context();
    let identity_type = issuer_type(&mut fixture.context, &fixture.always_success, [18u8; 20]);
    let identity_type_hash = identity_type.calc_script_hash();
    let did_lock = fixture
        .context
        .build_script(
            &fixture.did_lock,
            Bytes::from(identity_type_hash.as_slice().to_vec()),
        )
        .expect("DID Lock script");
    let first_controller = always_lock(&mut fixture.context, &fixture.always_success, 0x51);
    let first_identity = fixture.context.create_cell(
        did_output(100_000, first_controller, identity_type.clone()),
        Bytes::new(),
    );
    let second_controller = always_lock(&mut fixture.context, &fixture.always_success, 0x52);
    let second_identity = fixture.context.create_cell(
        did_output(100_000, second_controller, identity_type),
        Bytes::new(),
    );
    let subject_out_point = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000u64)
            .lock(did_lock)
            .build(),
        Bytes::new(),
    );
    let funding_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x53);
    let funding_out_point = funding_cell(&mut fixture.context, funding_lock, 100_000);
    let tx = TransactionBuilder::default()
        .cell_dep(
            CellDep::new_builder()
                .out_point(first_identity)
                .dep_type(DepType::Code)
                .build(),
        )
        .cell_dep(
            CellDep::new_builder()
                .out_point(second_identity)
                .dep_type(DepType::Code)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(subject_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(200_000u64)
                .lock(always_lock(
                    &mut fixture.context,
                    &fixture.always_success,
                    0x54,
                ))
                .build(),
        )
        .outputs_data([Bytes::new()].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);
    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn did_lock_rejects_missing_controller_authorization() {
    let mut fixture = test_context();
    let identity_type = issuer_type(&mut fixture.context, &fixture.always_success, [13u8; 20]);
    let identity_type_hash = identity_type.calc_script_hash();
    let controller_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x2e);
    let unrelated_lock = always_lock(&mut fixture.context, &fixture.always_success, 0x2f);
    let did_lock = fixture
        .context
        .build_script(
            &fixture.did_lock,
            Bytes::from(identity_type_hash.as_slice().to_vec()),
        )
        .expect("DID Lock script");
    let identity_out_point = fixture.context.create_cell(
        did_output(100_000, controller_lock, identity_type),
        Bytes::new(),
    );
    let subject_out_point = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000u64)
            .lock(did_lock)
            .build(),
        Bytes::new(),
    );
    let funding_out_point = funding_cell(&mut fixture.context, unrelated_lock.clone(), 100_000);
    let identity_dep = CellDep::new_builder()
        .out_point(identity_out_point)
        .dep_type(DepType::Code)
        .build();
    let tx = TransactionBuilder::default()
        .cell_dep(identity_dep)
        .input(
            CellInput::new_builder()
                .previous_output(subject_out_point)
                .build(),
        )
        .input(
            CellInput::new_builder()
                .previous_output(funding_out_point)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(200_000u64)
                .lock(unrelated_lock)
                .build(),
        )
        .outputs_data([Bytes::new()].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn did_lock_rejects_recursive_controller() {
    let mut fixture = test_context();
    let identity_type = issuer_type(&mut fixture.context, &fixture.always_success, [5u8; 20]);
    let identity_type_hash = identity_type.calc_script_hash();
    let recursive_controller = fixture
        .context
        .build_script(&fixture.did_lock, Bytes::from(vec![0x44]))
        .expect("recursive controller script");
    let mut recursive_bytes = recursive_controller.as_slice().to_vec();
    recursive_bytes.push(0);
    let recursive_controller = Script::new_unchecked(recursive_bytes.into());
    let did_lock = fixture
        .context
        .build_script(
            &fixture.did_lock,
            Bytes::from(identity_type_hash.as_slice().to_vec()),
        )
        .expect("DID Lock script");
    let identity_out_point = fixture.context.create_cell(
        did_output(100_000, recursive_controller, identity_type),
        Bytes::new(),
    );
    let subject_out_point = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(100_000u64)
            .lock(did_lock)
            .build(),
        Bytes::new(),
    );
    let identity_dep = CellDep::new_builder()
        .out_point(identity_out_point)
        .dep_type(DepType::Code)
        .build();
    let tx = TransactionBuilder::default()
        .cell_dep(identity_dep)
        .input(
            CellInput::new_builder()
                .previous_output(subject_out_point)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(100_000u64)
                .lock(always_lock(
                    &mut fixture.context,
                    &fixture.always_success,
                    0x45,
                ))
                .build(),
        )
        .outputs_data([Bytes::new()].pack())
        .build();
    let tx = fixture.context.complete_tx(tx);

    assert!(fixture.context.verify_tx(&tx, MAX_CYCLES).is_err());
}
