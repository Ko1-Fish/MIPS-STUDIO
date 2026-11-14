(function () {
  const sample = `# Print a message, then calculate 6 + 7
.data
message: .asciiz "Hello World!\\n"

.text
.globl main
main:
    la   $a0, message
    li   $v0, 4
    syscall

    li   $t0, 6
    li   $t1, 7
    add  $a0, $t0, $t1
    li   $v0, 1
    syscall

    li   $v0, 10
    syscall
`;

  const source = document.getElementById("source");
  const fileInput = document.getElementById("file-input");
  const fileName = document.getElementById("file-name");
  const output = document.getElementById("output");
  const status = document.getElementById("execution-status");
  const themeToggle = document.getElementById("theme-toggle");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const pcIndicator = document.querySelector("#pc-indicator b");
  let machine = null;
  let currentName = "untitled.asm";

  source.value = sample;

  function setTheme(theme) {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    themeToggle.textContent = `${nextTheme === "light" ? "Light" : "Dark"} mode`;
    themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    themeToggle.setAttribute("aria-pressed", String(theme === "light"));
    themeColor.content = theme === "dark" ? "#10151e" : "#f3f5f8";
  }

  setTheme(localStorage.getItem("mips-studio-theme") === "light" ? "light" : "dark");
  themeToggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("mips-studio-theme", theme);
    setTheme(theme);
  });

  function showError(error) {
    status.textContent = "Error";
    status.classList.add("error");
    output.textContent += `${output.textContent ? "\n" : ""}Error: ${error.message || error}`;
  }

  function clearError() {
    status.classList.remove("error");
  }

  function render() {
    const grid = document.getElementById("registers");
    const rows = machine ? machine.getRegisterRows() : Array.from({ length: 32 }, (_, index) => ({
      name: `$${["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"][index]}`,
      value: index === 29 ? 0x7ffffffc : 0,
      hex: index === 29 ? "0x7ffffffc" : "0x00000000"
    }));
    grid.innerHTML = rows.map(row =>
      `<div class="register-row"><span class="register-name">${row.name}</span><span class="register-decimal">${row.value}</span><span class="register-hex">${row.hex}</span></div>`
    ).join("");
    pcIndicator.textContent = machine ? `${machine.pc}${machine.halted ? " (halted)" : ""}` : "0";
    document.getElementById("hi-value").textContent = machine ? `0x${(machine.hi >>> 0).toString(16).padStart(8, "0")}` : "0x00000000";
    document.getElementById("lo-value").textContent = machine ? `0x${(machine.lo >>> 0).toString(16).padStart(8, "0")}` : "0x00000000";
    if (machine && machine.halted) status.textContent = "Finished";
  }

  function assemble() {
    machine = new MipsMachine(source.value);
    output.textContent = "";
    clearError();
    status.textContent = "Assembled";
    render();
  }

  function readInput(message) {
    const value = window.prompt(message);
    if (value === null) throw new Error("Input cancelled");
    return value;
  }

  function onRun() {
    try {
      if (!machine || machine.halted) assemble();
      clearError();
      machine.run(readInput);
      output.textContent = machine.output;
      status.textContent = machine.halted ? "Finished" : "Paused";
      render();
    } catch (error) {
      if (machine) output.textContent = machine.output;
      showError(error);
      render();
    }
  }

  document.getElementById("run-button").addEventListener("click", onRun);
  document.getElementById("step-button").addEventListener("click", () => {
    try {
      if (!machine) assemble();
      clearError();
      if (!machine.halted) machine.step(readInput);
      output.textContent = machine.output;
      status.textContent = machine.halted ? "Finished" : "Stepping";
      render();
    } catch (error) {
      if (machine) output.textContent = machine.output;
      showError(error);
      render();
    }
  });
  document.getElementById("reset-button").addEventListener("click", () => {
    try {
      if (!machine) machine = new MipsMachine(source.value);
      machine.reset();
      output.textContent = "";
      clearError();
      status.textContent = "Ready";
      render();
    } catch (error) {
      showError(error);
    }
  });
  document.getElementById("open-button").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      source.value = String(reader.result);
      currentName = file.name;
      fileName.textContent = currentName;
      machine = null;
      output.textContent = "";
      status.textContent = "File loaded";
      render();
    };
    reader.onerror = () => showError(new Error("Could not read the selected file"));
    reader.readAsText(file);
    fileInput.value = "";
  });
  document.getElementById("save-button").addEventListener("click", () => {
    const blob = new Blob([source.value], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = currentName.endsWith(".asm") ? currentName : `${currentName}.asm`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  document.getElementById("clear-output").addEventListener("click", () => { output.textContent = ""; });
  source.addEventListener("input", () => {
    machine = null;
    clearError();
    status.textContent = "Modified";
  });
  source.addEventListener("keydown", event => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = source.selectionStart;
      const end = source.selectionEnd;
      source.setRangeText("    ", start, end, "end");
      source.dispatchEvent(new Event("input"));
    }
  });

  render();
})();
