# MIPS Studio

A lightweight, browser-based MIPS assembly editor and simulator. No build step or dependencies are required.

## Start

Open `index.html` in a modern browser. Type or paste a program, or use **Open .asm** to load an `.asm`, `.s`, or `.txt` file. **Save** downloads the current editor contents as an assembly file.

Dark mode is the default. Use the theme button in the header to switch to light mode; your choice is saved for the next launch.

Use **Run** to execute the program, **Step** to advance one instruction, and **Reset** to restore the initial registers and data memory. Syscalls that read input use a browser prompt. Output from print syscalls appears in the Console panel.

The editor starts with a small example. For instance, replace it with:

```mips
.data
message: .asciiz "Hello from MIPS!\n"

.text
.globl main
main:
    la   $a0, message
    li   $v0, 4
    syscall
    li   $v0, 10
    syscall
```

## Supported assembly

The simulator currently supports common MIPS32 instructions and pseudoinstructions: integer arithmetic and logic (`add`, `sub`, `addi`, `and`, `or`, `xor`, `nor`, `lui`, and immediate forms), comparisons (`slt`, `slti`, `sltu`, `sltiu`), shifts, multiply/divide and HI/LO access, byte/halfword/word loads and stores, conditional branches (`beq`, `bne`, `beqz`, `bnez`, and signed/unsigned relational branches), `j`, `jal`, `jr`, `li`, `la`, `move`, `clear`, `neg`, `not`, `nop`, and `syscall`.

Supported directives are `.text`, `.data`, `.globl`/`.global`, `.ent`/`.end`, `.word`, `.half`, `.byte`, `.space`, `.align`, `.ascii`, and `.asciiz`. Data memory is little-endian. Implemented SPIM-style syscalls are 1, 4, 5, 8, 10, 11, and 12 (print integer/string/character, read integer/string/character, and exit).

This is an educational simulator, not a complete MARS/SPIM assembler. Unsupported instructions or directives and invalid memory alignment are reported in the Console. The PC display is the instruction index in the assembled text segment.

## Build desktop packages

The desktop version uses Electron. Install Node.js, then in this folder run:

```powershell
npm install
npm start
npm run package:win
```

The Windows command creates an x64 NSIS installer `.exe` in `dist`. To create the Debian package, run `npm install` and `npm run package:deb` on a Linux system (for example, Ubuntu in WSL). Linux packaging should be built on Linux; keeping a separate Linux-side copy of the project avoids mixing Windows and Linux dependencies. The `.deb` will also be written to `dist`.

For WSL, install Node.js 24 in Ubuntu (not the Windows Node installation), then copy the packaging files into the Linux filesystem and build there:

```bash
sudo apt update
sudo apt install -y curl ruby ruby-dev build-essential
sudo gem install fpm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24

mkdir -p ~/mips-studio
cp "/mnt/c/Users/ethan/Documents/MIPS IDE PROJECT"/{package.json,package-lock.json,main.cjs,index.html,styles.css,app.js,simulator.js,README.md} ~/mips-studio/
cd ~/mips-studio
npm ci
npm run package:deb
```

The Windows installer is unsigned by default, so Windows may show a SmartScreen warning. Signing requires a code-signing certificate.

## Simulator tests

With Node.js installed, run `node --test tests/simulator.test.js` from this folder.
