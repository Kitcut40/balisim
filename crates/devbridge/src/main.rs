//! Dev-only bridge used by the Vite dev server when the WebAssembly build is absent.
//! `balisim-devbridge run` reads a scenario JSON on stdin; `balisim-devbridge library` prints the library.
use std::io::Read;

fn main() {
    let cmd = std::env::args().nth(1).unwrap_or_default();
    if cmd == "library" {
        print!("{}", balisim_core::library_json());
    } else {
        let mut input = String::new();
        std::io::stdin().read_to_string(&mut input).expect("stdin");
        print!("{}", balisim_core::run_json(&input));
    }
}
