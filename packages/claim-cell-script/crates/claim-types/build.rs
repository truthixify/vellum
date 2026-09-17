use std::{env, fs, path::PathBuf};

fn generate(schema: &PathBuf, output: PathBuf, language: molecule_codegen::Language) {
    fs::create_dir_all(&output).expect("create molecule output directory");
    molecule_codegen::Compiler::new()
        .input_schema_file(schema)
        .generate_code(language)
        .output_dir(output)
        .run()
        .expect("generate Molecule bindings");
}

fn main() {
    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let schema = manifest_dir.join("../../molecules/claim.mol");
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").unwrap());

    println!("cargo:rerun-if-changed={}", schema.display());
    generate(
        &schema,
        out_dir.join("lazy"),
        molecule_codegen::Language::RustLazyReader,
    );
    generate(
        &schema,
        out_dir.join("entity"),
        molecule_codegen::Language::Rust,
    );
}
