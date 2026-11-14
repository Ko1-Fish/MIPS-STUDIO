# MIPS Studio

A lightweight, browser-based MIPS assembly editor and simulator. No build step or dependencies are required.

## Start

Open `index.html` in a modern browser. Type or paste a program, or use **Open .asm** to load an `.asm`, `.s`, or `.txt` file. **Save** downloads the current editor contents as an assembly file.

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

The simulator currently supports common MIPS32 instructions and pseudoinstructions: integer arithmetic and logic (`add`, `sub`, `addi`, `and`, `or`, `xor`, `nor`, `lui`, and immediate forms), comparisons (`slt`, `slti`, `sltu`, `sltiu`), shifts, multiply/divide and HI/LO access, byte/halfword/word loads and stores, conditional branches (`beq`, `bne`, signed and unsigned relational branches), `j`, `jal`, `jr`, `li`, `la`, `move`, `clear`, `neg`, `not`, `nop`, and `syscall`.

Supported directives are `.text`, `.data`, `.globl`/`.global`, `.ent`/`.end`, `.word`, `.half`, `.byte`, `.space`, `.align`, `.ascii`, and `.asciiz`. Data memory is little-endian. Implemented SPIM-style syscalls are 1, 4, 5, 8, 10, 11, and 12 (print integer/string/character, read integer/string/character, and exit).

This is an educational simulator, not a complete MARS/SPIM assembler. Unsupported instructions or directives and invalid memory alignment are reported in the Console. The PC display is the instruction index in the assembled text segment.

## Simulator tests

With Node.js installed, run `node --test tests/simulator.test.js` from this folder.
