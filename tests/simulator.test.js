const test = require("node:test");
const assert = require("node:assert/strict");
const MipsMachine = require("../simulator.js");

test("runs a program that prints a string and an arithmetic result", () => {
  const machine = new MipsMachine(`
.data
message: .asciiz "sum="
.text
main:
    la $a0, message
    li $v0, 4
    syscall
    li $t0, 6
    li $t1, 7
    add $a0, $t0, $t1
    li $v0, 1
    syscall
    li $v0, 10
    syscall
`);

  machine.run();

  assert.equal(machine.output, "sum=13");
  assert.equal(machine.registers[4], 13);
  assert.equal(machine.registers[0], 0);
});

test("executes branches and resets modified data memory", () => {
  const machine = new MipsMachine(`
.data
value: .word 0
.text
    li $t0, 0
loop:
    addi $t0, $t0, 1
    li $t1, 3
    bne $t0, $t1, loop
    sw $t0, value
`);

  machine.run();
  assert.equal(machine.registers[8], 3);
  assert.equal(machine.readMemory(machine.labels.value, 4, true, 1), 3);

  machine.reset();
  assert.equal(machine.readMemory(machine.labels.value, 4, true, 1), 0);
  assert.equal(machine.registers[8], 0);
});

test("reports unsupported instructions and unaligned word access", () => {
  assert.throws(() => new MipsMachine(".text\nunknown $t0").run(), /unsupported instruction/i);

  const machine = new MipsMachine(".text\nli $t0, 1\nlw $t1, 1($t0)");
  assert.throws(() => machine.run(), /unaligned 4-byte memory access/i);
});

test("implements common immediate, multiply, and pseudo-branch operations", () => {
  const machine = new MipsMachine(`
.text
    lui $t0, 1
    ori $t0, $t0, 5
    li $t1, 3
    mul $t2, $t0, $t1
    blt $t1, $t2, done
    li $s0, -1
done:
    sltiu $s1, $zero, 1
`);

  machine.run();

  assert.equal(machine.registers[8], 0x10005);
  assert.equal(machine.registers[10], 0x3000f);
  assert.equal(machine.registers[16], 0);
  assert.equal(machine.registers[17], 1);
});
