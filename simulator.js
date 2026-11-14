(function (root) {
  const DATA_START = 0x10010000;
  const STACK_START = 0x7ffffffc;
  const MASK = 0xffffffff;

  function numberValue(value, labels) {
    const text = value.trim();
    if (Object.prototype.hasOwnProperty.call(labels, text)) return labels[text];
    if (/^-?0x[0-9a-f]+$/i.test(text)) {
      const negative = text[0] === "-";
      const number = parseInt(negative ? text.slice(3) : text.slice(2), 16);
      return negative ? -number : number;
    }
    if (/^-?0b[01]+$/i.test(text)) {
      const negative = text[0] === "-";
      const number = parseInt(negative ? text.slice(3) : text.slice(2), 2);
      return negative ? -number : number;
    }
    if (/^-?\d+$/.test(text)) return Number(text);
    throw new Error(`Invalid number or label: ${text}`);
  }

  function stripComment(line) {
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (escaped) {
        escaped = false;
      } else if (char === "\\" && quoted) {
        escaped = true;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "#" && !quoted) {
        return line.slice(0, i);
      }
    }
    return line;
  }

  function splitArguments(text) {
    const result = [];
    let start = 0;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (escaped) {
        escaped = false;
      } else if (char === "\\" && quoted) {
        escaped = true;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (!quoted && char === "(") {
        depth += 1;
      } else if (!quoted && char === ")") {
        depth -= 1;
      } else if (!quoted && depth === 0 && char === ",") {
        result.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
    if (text.slice(start).trim()) result.push(text.slice(start).trim());
    return result;
  }

  function decodeString(value) {
    return value.replace(/\\(\\|"|n|r|t|0|x[0-9a-f]{2})/gi, function (match, escape) {
      if (escape[0].toLowerCase() === "x") return String.fromCharCode(parseInt(escape.slice(1), 16));
      return { "\\": "\\", '"': '"', n: "\n", r: "\r", t: "\t", 0: "\0" }[escape];
    });
  }

  class MipsMachine {
    constructor(source) {
      this.source = source;
      this.registerNames = this.createRegisterNames();
      this.registers = new Int32Array(32);
      this.memory = new Map();
      this.labels = {};
      this.instructions = [];
      this.hi = 0;
      this.lo = 0;
      this.pc = 0;
      this.output = "";
      this.halted = false;
      this.steps = 0;
      this.dataEnd = DATA_START;
      this.assemble(source);
      this.reset();
    }

    createRegisterNames() {
      const names = {};
      const aliases = [
        ["zero", "0"], ["at", "1"], ["v0", "2"], ["v1", "3"],
        ["a0", "4"], ["a1", "5"], ["a2", "6"], ["a3", "7"],
        ["t0", "8"], ["t1", "9"], ["t2", "10"], ["t3", "11"],
        ["t4", "12"], ["t5", "13"], ["t6", "14"], ["t7", "15"],
        ["s0", "16"], ["s1", "17"], ["s2", "18"], ["s3", "19"],
        ["s4", "20"], ["s5", "21"], ["s6", "22"], ["s7", "23"],
        ["t8", "24"], ["t9", "25"], ["k0", "26"], ["k1", "27"],
        ["gp", "28"], ["sp", "29"], ["fp", "30"], ["s8", "30"], ["ra", "31"]
      ];
      aliases.forEach(([name, index]) => { names[name] = Number(index); });
      for (let i = 0; i < 32; i += 1) names[String(i)] = i;
      return names;
    }

    assemble(source) {
      const rows = source.split(/\r?\n/).map((text, index) => ({
        text: stripComment(text).trim(),
        line: index + 1
      })).filter(row => row.text);
      let section = "text";
      let dataAddress = DATA_START;
      const parsed = [];

      rows.forEach(row => {
        let text = row.text;
        const labelMatch = text.match(/^([A-Za-z_.$][\w.$]*):\s*(.*)$/);
        if (labelMatch) {
          if (section === "data") {
            const dataDirective = labelMatch[2].match(/^\.(word|half|align)\b\s*(.*)$/i);
            if (dataDirective) {
              const exponent = dataDirective[1].toLowerCase() === "word" ? 2 :
                dataDirective[1].toLowerCase() === "half" ? 1 :
                  numberValue(splitArguments(dataDirective[2])[0] || "0", this.labels);
              const boundary = 1 << exponent;
              dataAddress = Math.ceil(dataAddress / boundary) * boundary;
            }
          }
          const label = labelMatch[1];
          if (Object.prototype.hasOwnProperty.call(this.labels, label)) {
            throw new Error(`Line ${row.line}: duplicate label "${label}"`);
          }
          this.labels[label] = section === "data" ? dataAddress : this.instructions.length;
          text = labelMatch[2].trim();
          if (!text) return;
        }

        if (text[0] === ".") {
          const directiveMatch = text.match(/^(\.[\w]+)\s*(.*)$/);
          if (!directiveMatch) return;
          const directive = directiveMatch[1].toLowerCase();
          const operandText = directiveMatch[2];
          if (directive === ".text") {
            section = "text";
          } else if (directive === ".data") {
            section = "data";
            if (operandText) dataAddress = numberValue(operandText, this.labels);
          } else if (directive === ".globl" || directive === ".global" || directive === ".ent" || directive === ".end") {
            return;
          } else if (section === "data") {
            const args = splitArguments(operandText);
            let size = 0;
            if (directive === ".word") size = args.length * 4;
            else if (directive === ".half") size = args.length * 2;
            else if (directive === ".byte") size = args.length;
            else if (directive === ".space") size = numberValue(args[0] || "0", this.labels);
            else if (directive === ".align") {
              const boundary = 1 << numberValue(args[0] || "0", this.labels);
              dataAddress = Math.ceil(dataAddress / boundary) * boundary;
            } else if (directive === ".ascii" || directive === ".asciiz") {
              size = args.reduce((total, item) => {
                if (!item.startsWith('"') || !item.endsWith('"')) {
                  throw new Error(`Line ${row.line}: expected a quoted string`);
                }
                return total + decodeString(item.slice(1, -1)).length;
              }, 0) + (directive === ".asciiz" ? 1 : 0);
            } else {
              throw new Error(`Line ${row.line}: unsupported directive ${directive}`);
            }
            if (size < 0) throw new Error(`Line ${row.line}: directive size cannot be negative`);
            parsed.push({ kind: "data", directive, args, address: dataAddress, line: row.line });
            dataAddress += size;
          }
          return;
        }

        if (section === "text") {
          const match = text.match(/^([A-Za-z][\w.]*)\s*(.*)$/);
          if (!match) throw new Error(`Line ${row.line}: invalid instruction`);
          this.instructions.push({
            op: match[1].toLowerCase(),
            args: splitArguments(match[2]),
            line: row.line,
            source: row.text
          });
        }
      });

      this.dataEnd = dataAddress;
      parsed.forEach(item => this.initializeData(item));
      this.initialMemory = new Map(this.memory);
      if (this.labels.main !== undefined) this.entryPoint = this.labels.main;
      else this.entryPoint = 0;
    }

    initializeData(item) {
      const { directive, args, address, line } = item;
      let cursor = address;
      const write = (value, bytes) => {
        let bits = value >>> 0;
        for (let i = 0; i < bytes; i += 1) {
          this.memory.set(cursor++, bits & 0xff);
          bits >>>= 8;
        }
      };
      if (directive === ".space" || directive === ".align") return;
      if (directive === ".ascii" || directive === ".asciiz") {
        args.forEach(arg => {
          if (!arg.startsWith('"') || !arg.endsWith('"')) {
            throw new Error(`Line ${line}: expected a quoted string`);
          }
          for (const char of decodeString(arg.slice(1, -1))) write(char.charCodeAt(0), 1);
        });
        if (directive === ".asciiz") write(0, 1);
        return;
      }
      const bytes = directive === ".word" ? 4 : directive === ".half" ? 2 : 1;
      args.forEach(arg => write(numberValue(arg, this.labels), bytes));
    }

    reset() {
      if (this.initialMemory) this.memory = new Map(this.initialMemory);
      this.registers.fill(0);
      this.registers[29] = STACK_START;
      this.hi = 0;
      this.lo = 0;
      this.pc = this.entryPoint;
      this.output = "";
      this.halted = false;
      this.steps = 0;
    }

    registerIndex(name, line) {
      const normalized = name.trim().replace(/^\$/, "").toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(this.registerNames, normalized)) {
        throw new Error(`Line ${line}: unknown register "${name}"`);
      }
      return this.registerNames[normalized];
    }

    getRegister(name, line) {
      return this.registers[this.registerIndex(name, line)] | 0;
    }

    setRegister(name, value, line) {
      const index = this.registerIndex(name, line);
      if (index !== 0) this.registers[index] = value | 0;
    }

    operand(value, line) {
      const text = value.trim();
      if (text.startsWith("$")) return this.getRegister(text, line);
      return numberValue(text, this.labels);
    }

    address(value, line) {
      const text = value.trim();
      const match = text.match(/^(.+?)\s*\(\s*(\$[^)]+)\s*\)$/);
      if (match) return (this.operand(match[1], line) + this.getRegister(match[2], line)) >>> 0;
      return this.operand(text, line) >>> 0;
    }

    readMemory(address, bytes, signed, line) {
      if (bytes > 1 && address % bytes !== 0) {
        throw new Error(`Line ${line}: unaligned ${bytes}-byte memory access at 0x${address.toString(16)}`);
      }
      let value = 0;
      for (let i = 0; i < bytes; i += 1) value |= (this.memory.get((address + i) >>> 0) || 0) << (8 * i);
      if (signed && bytes === 1) return (value << 24) >> 24;
      if (signed && bytes === 2) return (value << 16) >> 16;
      return value >>> 0;
    }

    writeMemory(address, value, bytes, line) {
      if (bytes > 1 && address % bytes !== 0) {
        throw new Error(`Line ${line}: unaligned ${bytes}-byte memory access at 0x${address.toString(16)}`);
      }
      let bits = value >>> 0;
      for (let i = 0; i < bytes; i += 1) {
        this.memory.set((address + i) >>> 0, bits & 0xff);
        bits >>>= 8;
      }
    }

    step(inputHandler) {
      if (this.halted) return false;
      if (this.pc < 0 || this.pc >= this.instructions.length) {
        throw new Error(`Program counter ${this.pc} is outside the text segment`);
      }
      const instruction = this.instructions[this.pc];
      const { op, args, line } = instruction;
      let next = this.pc + 1;
      const requireArgs = count => {
        if (args.length !== count) throw new Error(`Line ${line}: ${op} expects ${count} operand(s), got ${args.length}`);
      };
      const reg = index => this.getRegister(args[index], line);
      const set = (index, value) => this.setRegister(args[index], value, line);
      const imm = index => this.operand(args[index], line);
      const branch = target => {
        if (!Object.prototype.hasOwnProperty.call(this.labels, target)) {
          throw new Error(`Line ${line}: unknown label "${target}"`);
        }
        next = this.labels[target];
      };

      switch (op) {
        case "nop": requireArgs(0); break;
        case "li": requireArgs(2); set(0, imm(1)); break;
        case "la": requireArgs(2); set(0, imm(1)); break;
        case "lui": requireArgs(2); set(0, imm(1) << 16); break;
        case "move": requireArgs(2); set(0, reg(1)); break;
        case "clear": requireArgs(1); set(0, 0); break;
        case "not": requireArgs(2); set(0, ~reg(1)); break;
        case "neg": requireArgs(2); set(0, -reg(1)); break;
        case "add": case "addu":
          requireArgs(3); set(0, reg(1) + reg(2)); break;
        case "addi": case "addiu":
          requireArgs(3); set(0, reg(1) + imm(2)); break;
        case "sub": case "subu":
          requireArgs(3); set(0, reg(1) - reg(2)); break;
        case "and": case "or": case "xor": case "nor":
          requireArgs(3);
          set(0, op === "and" ? reg(1) & reg(2) : op === "or" ? reg(1) | reg(2) :
            op === "xor" ? reg(1) ^ reg(2) : ~(reg(1) | reg(2)));
          break;
        case "andi": case "ori": case "xori":
          requireArgs(3);
          set(0, op === "andi" ? reg(1) & imm(2) : op === "ori" ? reg(1) | imm(2) : reg(1) ^ imm(2));
          break;
        case "slt":
          requireArgs(3); set(0, reg(1) < reg(2) ? 1 : 0); break;
        case "slti":
          requireArgs(3); set(0, reg(1) < imm(2) ? 1 : 0); break;
        case "sltu":
          requireArgs(3); set(0, (reg(1) >>> 0) < (reg(2) >>> 0) ? 1 : 0); break;
        case "sltiu":
          requireArgs(3); set(0, (reg(1) >>> 0) < (imm(2) >>> 0) ? 1 : 0); break;
        case "mul":
          requireArgs(3); set(0, Math.imul(reg(1), reg(2))); break;
        case "sll": case "srl": case "sra":
          requireArgs(3);
          set(0, op === "sll" ? reg(1) << imm(2) : op === "srl" ? reg(1) >>> imm(2) : reg(1) >> imm(2));
          break;
        case "sllv": case "srlv": case "srav":
          requireArgs(3);
          set(0, op === "sllv" ? reg(1) << (reg(2) & 31) : op === "srlv" ? reg(1) >>> (reg(2) & 31) : reg(1) >> (reg(2) & 31));
          break;
        case "mult": case "multu": {
          requireArgs(2);
          const product = op === "mult" ? BigInt(reg(0)) * BigInt(reg(1)) :
            BigInt(reg(0) >>> 0) * BigInt(reg(1) >>> 0);
          this.lo = Number(BigInt.asIntN(32, product));
          this.hi = Number(BigInt.asIntN(32, product >> 32n));
          break;
        }
        case "div": case "divu":
          requireArgs(2);
          if (reg(1) === 0) throw new Error(`Line ${line}: division by zero`);
          this.lo = op === "div" ? Math.trunc(reg(0) / reg(1)) : Math.floor((reg(0) >>> 0) / (reg(1) >>> 0));
          this.hi = op === "div" ? reg(0) % reg(1) : (reg(0) >>> 0) % (reg(1) >>> 0);
          break;
        case "mfhi": requireArgs(1); set(0, this.hi); break;
        case "mflo": requireArgs(1); set(0, this.lo); break;
        case "lw": case "lh": case "lhu": case "lb": case "lbu": {
          requireArgs(2);
          const bytes = op === "lw" ? 4 : op === "lh" || op === "lhu" ? 2 : 1;
          set(0, this.readMemory(this.address(args[1], line), bytes, op === "lw" || op === "lh" || op === "lb", line));
          break;
        }
        case "sw": case "sh": case "sb": {
          requireArgs(2);
          const bytes = op === "sw" ? 4 : op === "sh" ? 2 : 1;
          this.writeMemory(this.address(args[1], line), reg(0), bytes, line);
          break;
        }
        case "beq": case "bne":
          requireArgs(3);
          if (op === "beq" ? reg(0) === imm(1) : reg(0) !== imm(1)) branch(args[2]);
          break;
        case "beqz": case "bnez":
          requireArgs(2);
          if (op === "beqz" ? reg(0) === 0 : reg(0) !== 0) branch(args[1]);
          break;
        case "bgtz": case "blez": case "bltz": case "bgez":
          requireArgs(2);
          if (op === "bgtz" ? reg(0) > 0 : op === "blez" ? reg(0) <= 0 : op === "bltz" ? reg(0) < 0 : reg(0) >= 0) branch(args[1]);
          break;
        case "blt": case "bge": case "bgt": case "ble":
          requireArgs(3);
          if (op === "blt" ? reg(0) < reg(1) : op === "bge" ? reg(0) >= reg(1) :
            op === "bgt" ? reg(0) > reg(1) : reg(0) <= reg(1)) branch(args[2]);
          break;
        case "bltu": case "bgeu": case "bgtu": case "bleu": {
          requireArgs(3);
          const left = reg(0) >>> 0;
          const right = reg(1) >>> 0;
          if (op === "bltu" ? left < right : op === "bgeu" ? left >= right :
            op === "bgtu" ? left > right : left <= right) branch(args[2]);
          break;
        }
        case "b": requireArgs(1); branch(args[0]); break;
        case "j": case "jal":
          requireArgs(1);
          if (op === "jal") this.setRegister("$ra", this.pc + 1, line);
          branch(args[0]);
          break;
        case "jr": requireArgs(1); next = reg(0); break;
        case "syscall":
          requireArgs(0);
          this.handleSyscall(inputHandler);
          break;
        default: throw new Error(`Line ${line}: unsupported instruction "${op}"`);
      }
      this.pc = next;
      this.registers[0] = 0;
      this.steps += 1;
      if (this.pc >= this.instructions.length) this.halted = true;
      return !this.halted;
    }

    handleSyscall(inputHandler) {
      const service = this.registers[2];
      if (service === 1) this.output += String(this.registers[4]);
      else if (service === 4) {
        let address = this.registers[4] >>> 0;
        let char = this.readMemory(address++, 1, false, this.instructions[this.pc].line);
        let guard = 0;
        while (char !== 0 && guard < 65536) {
          this.output += String.fromCharCode(char);
          char = this.readMemory(address++, 1, false, this.instructions[this.pc].line);
          guard += 1;
        }
      } else if (service === 5) {
        if (!inputHandler) throw new Error("Syscall 5 needs an input handler");
        this.registers[2] = Number(inputHandler("Enter an integer:")) | 0;
      } else if (service === 8) {
        if (!inputHandler) throw new Error("Syscall 8 needs an input handler");
        const value = String(inputHandler("Enter text:") || "") + "\0";
        const address = this.registers[4] >>> 0;
        const limit = Math.max(0, this.registers[5] - 1);
        for (let i = 0; i < Math.min(value.length, limit); i += 1) this.writeMemory(address + i, value.charCodeAt(i), 1, this.instructions[this.pc].line);
        this.writeMemory(address + Math.min(value.length - 1, limit), 0, 1, this.instructions[this.pc].line);
      } else if (service === 10) {
        this.halted = true;
      } else if (service === 11) this.output += String.fromCharCode(this.registers[4] & 0xff);
      else if (service === 12) {
        if (!inputHandler) throw new Error("Syscall 12 needs an input handler");
        this.registers[2] = String(inputHandler("Enter a character:") || "").charCodeAt(0) || 0;
      } else if (service !== 0) {
        throw new Error(`Unsupported syscall ${service}`);
      }
    }

    run(inputHandler, maxSteps) {
      const limit = maxSteps || 100000;
      let count = 0;
      while (!this.halted && count < limit) {
        this.step(inputHandler);
        count += 1;
      }
      if (!this.halted && count >= limit) throw new Error(`Execution stopped after ${limit} instructions (possible infinite loop)`);
      return count;
    }

    getRegisterRows() {
      const names = ["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"];
      return names.map((name, index) => ({
        name: `$${name}`,
        value: this.registers[index] | 0,
        hex: `0x${(this.registers[index] >>> 0).toString(16).padStart(8, "0")}`
      }));
    }
  }

  root.MipsMachine = MipsMachine;
  if (typeof module !== "undefined" && module.exports) module.exports = MipsMachine;
})(typeof window !== "undefined" ? window : globalThis);
