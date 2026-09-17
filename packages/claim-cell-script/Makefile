MODE ?= release
TARGET ?= riscv64imac-unknown-none-elf
BUILD_DIR := build/$(MODE)
TARGET_DIR := target/$(TARGET)/$(MODE)
CONTRACT_RUSTFLAGS := $(strip $(RUSTFLAGS) -C target-feature=-a,-zba,-zbb,-zbc,-zbs)
PROFILE_FLAG := $(if $(filter release,$(MODE)),--release,)

.PHONY: build test check clippy fmt size prepare

build:
	RUSTFLAGS="$(CONTRACT_RUSTFLAGS)" cargo build --locked -p claim-cell -p did-lock --target $(TARGET) $(PROFILE_FLAG)
	mkdir -p $(BUILD_DIR)
	cp $(TARGET_DIR)/claim-cell $(BUILD_DIR)/claim-cell
	cp $(TARGET_DIR)/did-lock $(BUILD_DIR)/did-lock

test: build
	VELLUM_BUILD_DIR="$(BUILD_DIR)" cargo test --locked -p vellum-claim-types -p vellum-claim-tests

check:
	RUSTFLAGS="$(CONTRACT_RUSTFLAGS)" cargo check --locked -p claim-cell -p did-lock --target $(TARGET)
	cargo check --locked -p vellum-claim-types -p vellum-claim-tests

clippy:
	RUSTFLAGS="$(CONTRACT_RUSTFLAGS)" cargo clippy --locked -p claim-cell -p did-lock --target $(TARGET) -- -D warnings
	cargo clippy --locked -p vellum-claim-types -p vellum-claim-tests --all-targets -- -D warnings

fmt:
	cargo fmt --all -- --check

prepare:
	rustup target add $(TARGET)

size: build
	c=$$(wc -c < $(BUILD_DIR)/claim-cell); \
	d=$$(wc -c < $(BUILD_DIR)/did-lock); \
	printf 'claim-cell %s bytes\ndid-lock %s bytes\n' "$$c" "$$d"
