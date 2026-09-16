#![cfg_attr(target_arch = "riscv64", no_main)]
#![cfg_attr(target_arch = "riscv64", no_std)]

mod error;
#[path = "entry.rs"]
mod script;

#[cfg(target_arch = "riscv64")]
use ckb_std::{default_alloc, entry};

#[cfg(target_arch = "riscv64")]
entry!(program_entry);
#[cfg(target_arch = "riscv64")]
default_alloc!(16384, 0x200000, 64);

#[cfg(target_arch = "riscv64")]
fn program_entry() -> i8 {
    match script::run() {
        Ok(()) => 0,
        Err(error) => error.code(),
    }
}

#[cfg(not(target_arch = "riscv64"))]
fn main() {}
