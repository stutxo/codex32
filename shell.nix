{ pkgs ? import <nixpkgs> {}, withBrowser ? false }:
pkgs.mkShell {
  packages = with pkgs; [ rustup gcc clang pkg-config nodejs python3 ]
    ++ lib.optionals withBrowser [ chromium chromedriver ];
  # Native hardening flags injected by Nix's wrapper are not valid WASM flags.
  CC_wasm32_unknown_unknown = "${pkgs.llvmPackages.clang-unwrapped}/bin/clang";
  shellHook = ''
    export PATH="''${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
  '';
}
