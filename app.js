// ====== Состояние ======
let employees = JSON.parse(localStorage.getItem("employees") || "[]");
let requests  = JSON.parse(localStorage.getItem("requests")  || "[]");

let adminOpen = false;
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();

const COLORS = ["#6C63FF","#FF6584","#4CAF50","#FF9800","#00BCD4","#9C27B0","#795548"];

// ====== Утилиты ======
const $ = sel => document.querySelector(sel);
const MS_DAY = 24*60*60*1000;
const DAILY_RATE = 1.75 / 30.4375; // ≈ 0.0575 дня/сутки

function save(){
  localStorage.setItem("employees", JSON.stringify(employees));
  localStorage.setItem("requests",  JSON.stringify(requests));
}
function normalizeDate(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysBetween(a, b){ // целые сутки: [a, b)
  return Math.max(0, Math.floor((normalizeDate(b) - normalizeDate(a)) / MS_DAY));
}

// ====== Автоначисление (ежедневно, пропорционально) ======
// Храним emp.autoAccrued — сколько автоначислено всего с даты начала.
// На каждом рендере считаем, сколько ДОЛЖНО быть на сегодня, и докидываем разницу в emp.days.
function accrueDaily(){
  const today = normalizeDate(new Date());
  let changed = false;

  employees.forEach(emp=>{
    // миграция старых данных
    if(!emp.startDate){
      emp.startDate = today.toISOString().slice(0,10);
    }
    if(typeof emp.autoAccrued !== "number"){
      // инициализируем без изменения текущего баланса (чтобы не задним числом докидывать)
      emp.autoAccrued = daysBetween(new Date(emp.startDate), today) * DAILY_RATE;
      changed = true;
      return;
    }

    // рассчитываем, сколько должно быть на сегодня
    const shouldBe = daysBetween(new Date(emp.startDate), today) * DAILY_RATE;
    const delta = +(shouldBe - emp.autoAccrued).toFixed(6); // фикс мелких двоичных артефактов

    if (delta !== 0){
      emp.autoAccrued += delta;
      emp.days = (emp.days || 0) + delta;
      changed = true;
    }
  });

  if(changed) save();
}

// ====== Рендер ======
function render(){
  accrueDaily();
  renderAdminEmployees();
  renderAdminRequests();
  renderEmployeeSelectAndPanel();
  renderCalendar();
}

function renderAdminEmployees(){
  const table = $("#empTable");
  table.innerHTML = `
    <tr>
      <th>Имя</th>
      <th>Дней</th>
      <th>Работает с</th>
      <th>Цвет</th>
      <th class="cell-narrow" colspan="2">Действия</th>
    </tr>`;
  employees.forEach(e=>{
    table.innerHTML += `
      <tr>
        <td>${e.name}</td>
        <td>${(e.days||0).toFixed(2)}</td>
        <td>
          <div class="days-input">
            <input type="date" id="startDate_${e.id}" value="${(e.startDate||'').slice(0,10)}" />
            <button class="btn" onclick="saveStartDate(${e.id})">Сохранить</button>
          </div>
          <div style="font-size:12px;opacity:.7">Автоначислено: ${(e.autoAccrued||0).toFixed(2)} дн.</div>
        </td>
        <td><input type="color" value="${e.color||'#999'}" onchange="changeColor(${e.id}, this.value)" /></td>
        <td class="cell-narrow">
          <div class="days-input">
            <input type="number" step="0.25" id="addDaysInput_${e.id}" placeholder="+дни" />
            <button class="btn add" onclick="addDays(${e.id})">OK</button>
          </div>
        </td>
        <td class="cell-narrow"><button class="btn delete" onclick="deleteEmployee(${e.id})">Удалить</button></td>
      </tr>
    `;
  });
}

function renderAdminRequests(){
  const filter = $("#reqFilter")?.value || "all";
  const table = $("#reqTable");
  table.innerHTML = "<tr><th>Сотрудник</th><th>Даты</th><th>Статус</th><th></th></tr>";
  requests
    .filter(r => filter === "all" ? true : r.status === filter)
    .forEach(r=>{
      table.innerHTML += `
        <tr>
          <td>${r.name}</td>
          <td>${r.from} → ${r.to}</td>
          <td><span class="status ${r.status}">${r.status}</span></td>
          <td>
            ${
              r.status === "pending"
              ? `<button class="btn approve" onclick="updateStatus(${r.id},'approved')">✔</button>
                 <button class="btn reject"  onclick="updateStatus(${r.id},'rejected')">✖</button>`
              : r.status === "approved"
              ? `<button class="btn toggle"  onclick="updateStatus(${r.id},'pending')">↺ Pending</button>
                 <button class="btn reject"  onclick="updateStatus(${r.id},'rejected')">✖ Отказ</button>`
              : /* rejected */ `<button class="btn toggle" onclick="updateStatus(${r.id},'pending')">↺ Pending</button>`
            }
          </td>
        </tr>
      `;
    });
}

function renderEmployeeSelectAndPanel(){
  const sel = $("#empSelect");
  sel.innerHTML = "";
  employees.forEach(e=>{
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = `${e.name} (${(e.days||0).toFixed(2)}д.)`;
    sel.appendChild(opt);
  });
  renderEmployeeRequests();
}

function renderEmployeeRequests(){
  const empId = parseInt($("#empSelect").value || "0");
  const emp   = employees.find(e=>e.id===empId);
  $("#empDays").textContent = emp ? `Доступно отпускных дней: ${(emp.days||0).toFixed(2)}` : "";

  const table = $("#empReqTable");
  table.innerHTML = "<tr><th>Даты</th><th>Статус</th></tr>";
  requests.filter(r=>r.empId===empId).forEach(r=>{
    table.innerHTML += `
      <tr>
        <td>${r.from} → ${r.to}</td>
        <td><span class="status ${r.status}">${r.status}</span></td>
      </tr>
    `;
  });
}

function renderCalendar(){
  const cal  = $("#calendar");
  const year = currentYear, month = currentMonth;
  cal.innerHTML = "";

  const dim = new Date(year, month+1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0=вс
  $("#calendarTitle").textContent = new Date(year,month).toLocaleString("ru",{month:"long",year:"numeric"});

  let start = (firstDay + 6) % 7; // понедельник первым
  for(let i=0;i<start;i++) cal.innerHTML += `<div class="day"></div>`;

  for(let d=1; d<=dim; d++){
    const dayEl = document.createElement("div");
    dayEl.className = "day";
    dayEl.innerHTML = `<strong>${d}</strong>`;

    const cur = normalizeDate(new Date(year,month,d));

    requests
      .filter(r=>r.status!=="rejected")
      .forEach(r=>{
        const from = normalizeDate(new Date(r.from));
        const to   = normalizeDate(new Date(r.to));
        if(cur>=from && cur<=to){
          const emp   = employees.find(e=>e.id===r.empId);
          const color = emp?.color || "#999";
          const pendingClass = r.status === "pending" ? "pending" : "";
          dayEl.innerHTML += `
            <div class="leave ${pendingClass}" style="background:${color}">
              <span class="name">${r.name}</span>
              <span class="status">${r.status}</span>
              <span class="dates">${r.from} → ${r.to}</span>
            </div>
          `;
        }
      });

    cal.appendChild(dayEl);
  }
}

// ====== Действия ======
function toggleAdmin(){
  if(!adminOpen){
    const pass = prompt("Введите пароль для входа в админку:");
    if(pass === "1234"){
      $("#adminPanel").style.display = "block";
      adminOpen = true;
    }else{
      alert("Неверный пароль!");
    }
  }else{
    $("#adminPanel").style.display = "none";
    adminOpen = false;
  }
}

function addEmployee(){
  const name = ($("#empName").value || "").trim();
  const startDate = $("#empStartDate").value || new Date().toISOString().slice(0,10);
  if(!name) return;

  const color = COLORS[employees.length % COLORS.length];
  // autoAccrued и days стартуют с 0 — при первом render() accrueDaily() проставит автоначисленное "как должно быть",
  // НЕ изменяя баланс задним числом (инициализирует autoAccrued, но не тронет days).
  employees.push({
    id: Date.now(),
    name,
    days: 0,
    startDate,
    autoAccrued: undefined,
    color
  });

  $("#empName").value = "";
  $("#empStartDate").value = "";
  save(); render();
}

function saveStartDate(id){
  const input = document.getElementById("startDate_"+id);
  const newStart = input.value;
  const emp = employees.find(e=>e.id===id);
  if(!emp) return;

  const today = new Date();
  const shouldBe = daysBetween(new Date(newStart), today) * DAILY_RATE;
  const oldAuto  = emp.autoAccrued || 0;
  const delta = +(shouldBe - oldAuto).toFixed(6);

  emp.startDate = newStart;
  emp.autoAccrued = shouldBe;
  emp.days = (emp.days || 0) + delta;

  save(); render();
}

function addDays(id){
  const input = document.getElementById("addDaysInput_"+id);
  const val = parseFloat(input.value);
  if(isNaN(val)) return;
  const emp = employees.find(e=>e.id===id);
  emp.days = (emp.days||0) + val;
  input.value = "";
  save(); render();
}

function changeColor(id, color){
  const emp = employees.find(e=>e.id===id);
  if(emp){ emp.color = color; save(); render(); }
}

function deleteEmployee(id){
  if(!confirm("Удалить сотрудника?")) return;
  employees = employees.filter(e=>e.id!==id);
  requests  = requests.filter(r=>r.empId!==id);
  save(); render();
}

function makeRequest(){
  const empId = parseInt($("#empSelect").value || "0");
  const emp   = employees.find(e=>e.id===empId);
  const from  = $("#fromDate").value;
  const to    = $("#toDate").value;

  if(!emp){ alert("Выберите сотрудника"); return; }
  if(!from || !to){ alert("Укажи даты!"); return; }

  const days = (new Date(to) - new Date(from))/(1000*60*60*24) + 1;
  if(days <= 0){ alert("Неверные даты"); return; }
  if(days > (emp.days || 0)){ alert(`У ${emp.name} есть только ${(emp.days||0).toFixed(2)} дней`); return; }

  requests.push({ id: Date.now(), empId, name: emp.name, from, to, days, status: "pending" });
  save(); render();
}

function updateStatus(id, status){
  const req = requests.find(r=>r.id===id);
  const emp = employees.find(e=>e.id===req.empId);

  if(req.status === "approved" && status !== "approved"){
    emp.days = (emp.days||0) + req.days; // вернуть дни при отмене approve
  }
  if(req.status !== "approved" && status === "approved"){
    emp.days = (emp.days||0) - req.days; // списать при approve
  }

  req.status = status;
  save(); render();
}

// ====== События ======
document.addEventListener("DOMContentLoaded", ()=>{
  $("#btnAdmin").addEventListener("click", toggleAdmin);
  $("#btnAddEmp").addEventListener("click", addEmployee);
  $("#btnMakeReq").addEventListener("click", makeRequest);
  $("#btnPrev").addEventListener("click", ()=>{ currentMonth--; if(currentMonth<0){currentMonth=11; currentYear--;} renderCalendar(); });
  $("#btnNext").addEventListener("click", ()=>{ currentMonth++; if(currentMonth>11){currentMonth=0; currentYear++;} renderCalendar(); });

  $("#reqFilter").addEventListener("change", render);
  $("#empSelect").addEventListener("change", renderEmployeeRequests);

  // дефолтная дата начала — сегодня
  const today = new Date().toISOString().slice(0,10);
  const startInput = document.getElementById("empStartDate");
  if(startInput && !startInput.value) startInput.value = today;

  render();
});

// Экспорт для inline-обработчиков
window.addDays = addDays;
window.changeColor = changeColor;
window.deleteEmployee = deleteEmployee;
window.updateStatus = updateStatus;
window.saveStartDate = saveStartDate;
