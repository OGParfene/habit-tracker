// Variables globales
let currentDate = new Date();
let data = JSON.parse(localStorage.getItem('calendarData')) || {};
let currentView = 'calendar';
const sportsList = ["Abdominales", "Boxeo", "Futbol","Cardio", "Natación", "Padel", "Tenis"];

// Elementos del DOM
const elements = {
    monthTitle: document.getElementById('month-title'),
    currentDate: document.getElementById('current-date'),
    calendarDays: document.getElementById('calendar-days'),
    summaryActivities: document.getElementById('summary-activities'),
    calendarView: document.getElementById('calendar-view'),
    summaryView: document.getElementById('summary-view'),
    prevMonthBtn: document.getElementById('prev-month'),
    nextMonthBtn: document.getElementById('next-month'),
    toggleViewBtn: document.getElementById('toggle-view'),
    backToCalendarBtn: document.getElementById('back-to-calendar'),
    toggleIcon: document.getElementById('toggle-icon')
};

// Funciones de utilidad
function getMonthName(monthIndex) {
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return months[monthIndex];
}

function getDayName(dayIndex) {
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return days[dayIndex];
}

function getDayNameAbbr(dayIndex) {
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return days[dayIndex];
}

function getDateKey(year, month, day) {
    return `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
}

function getFoodClass(food) {
    switch (food) {
        case 'Perfecto': return 'food-perfect';
        case 'Bien': return 'food-good';
        case 'Normal': return 'food-normal';
        case 'Mal': return 'food-bad';
        default: return '';
    }
}

// Funciones de manejo de datos
function saveData() {
    localStorage.setItem('calendarData', JSON.stringify(data));
}

function loadData() {
    const saved = localStorage.getItem('calendarData');
    return saved ? JSON.parse(saved) : {};
}

// Funciones de renderizado
function renderSports(sports, dayNumber) {
    return sports.map(sport => `
        <span class="sport-badge" onclick="removeSport(${dayNumber}, '${sport}')">
            ${sport}
            <span class="remove">✕</span>
        </span>
    `).join('');
}

function updateCalendar() {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    const today = new Date();
    
    elements.monthTitle.textContent = `${getMonthName(month)} ${year}`;
    elements.currentDate.textContent = `${getDayName(today.getDay())}, ${today.getDate()} de ${getMonthName(today.getMonth())}`;

    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const lastDate = new Date(year, month + 1, 0).getDate();
    let daysHTML = '';

    // Días vacíos al inicio
    for (let i = 0; i < firstDay; i++) {
        daysHTML += '<div class="h-0"></div>';
    }

    // Días del mes
    for (let day = 1; day <= lastDate; day++) {
        const date = new Date(year, month, day);
        const dateKey = getDateKey(year, month + 1, day);
        const isToday = date.toDateString() === today.toDateString();
        const checkedData = data[dateKey] || {};
        const dayOfWeek = date.getDay();

        daysHTML += `
            <div class="calendar-day habit-card ${isToday ? 'current-day' : 'bg-white'} border border-gray-100">
                <div class="calendar-day-content flex flex-col h-full">
                    <div class="flex justify-between items-center mb-3">
                        <span class="font-medium text-lg">${day}</span>
                        <span class="text-sm text-gray-500 hidden md:inline">${getDayNameAbbr(dayOfWeek)}</span>
                    </div>
                    
                    <div class="habits-grid grid mb-3 flex-grow">
                        <div class="habit-button ${checkedData.exercise ? 'active' : ''}" 
                            onclick="toggleButton(${day}, 'exercise')">
                            <span class="emoji">💪</span>
                            <span>Ejercicio</span>
                        </div>
                        
                        <div class="habit-button ${checkedData.creatine ? 'active' : ''}" 
                            onclick="toggleButton(${day}, 'creatine')">
                            <span class="emoji">🧪</span>
                            <span>Creatina</span>
                        </div>
                        
                        <div class="habit-button ${checkedData.steps ? 'active' : ''}" 
                            onclick="toggleButton(${day}, 'steps')">
                            <span class="emoji">👟</span>
                            <span>Pasos</span>
                        </div>
                        
                        <div class="habit-button ${checkedData.reading ? 'active' : ''}" 
                            onclick="toggleButton(${day}, 'reading')">
                            <span class="emoji">📚</span>
                            <span>Lectura</span>
                        </div>
                    </div>
                    
                    <select onchange="setFood(${day}, this)" 
                        class="w-full p-2 rounded-lg border border-gray-200 food-select mb-3 ${getFoodClass(checkedData.food)}">
                        <option value="">Comida</option>
                        <option ${checkedData.food === 'Perfecto' ? 'selected' : ''} value="Perfecto">Perfecto</option>
                        <option ${checkedData.food === 'Bien' ? 'selected' : ''} value="Bien">Bien</option>
                        <option ${checkedData.food === 'Normal' ? 'selected' : ''} value="Normal">Normal</option>
                        <option ${checkedData.food === 'Mal' ? 'selected' : ''} value="Mal">Mal</option>
                    </select>
                    
                    <div class="mt-auto">
                        <select onchange="addSport(${day}, this)" 
                            class="w-full p-2 rounded-lg border border-gray-200 sport-select mb-2">
                            <option value="">Añadir deporte</option>
                            ${sportsList.map(sport => `<option value="${sport}">${sport}</option>`).join('')}
                        </select>
                        <div class="flex flex-wrap">
                            ${checkedData.sports ? renderSports(checkedData.sports, day) : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    elements.calendarDays.innerHTML = daysHTML;
    
    // Desplazarse al día actual
    setTimeout(() => {
        const currentDayElement = document.querySelector('.current-day');
        if (currentDayElement) {
            currentDayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

function showSummary() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const totalDays = new Date(year, month, 0).getDate();
    
    let totalExercise = 0;
    let totalCreatine = 0;
    let totalSteps = 0;
    let totalReading = 0;
    let daysRecorded = 0;
    let meals = { Perfecto: 0, Bien: 0, Normal: 0, Mal: 0 };
    let sports = {};
    
    // Calcular estadísticas
    for (let day = 1; day <= totalDays; day++) {
        const dateKey = getDateKey(year, month, day);
        if (data[dateKey]) {
            daysRecorded++;
            if (data[dateKey].exercise) totalExercise++;
            if (data[dateKey].creatine) totalCreatine++;
            if (data[dateKey].steps) totalSteps++;
            if (data[dateKey].reading) totalReading++;
            
            if (data[dateKey].food) {
                meals[data[dateKey].food]++;
            }
            
            if (data[dateKey].sports) {
                data[dateKey].sports.forEach(sport => {
                    sports[sport] = (sports[sport] || 0) + 1;
                });
            }
        }
    }
    
    // Generar HTML de deportes
    let sportsHTML = '';
    const sortedSports = Object.entries(sports).sort((a, b) => b[1] - a[1]);
    if (sortedSports.length > 0) {
        sportsHTML = `
            <div class="mt-6">
                <h3 class="font-semibold mb-3 text-gray-700">Deportes practicados</h3>
                <div class="flex flex-wrap gap-2">
                    ${sortedSports.map(([sport, count]) => `
                        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                            ${sport}: ${count}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Generar HTML del resumen
    const summaryHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gray-50 p-4 rounded-lg">
                <h3 class="font-medium text-gray-500 mb-1">Días registrados</h3>
                <p class="text-2xl font-bold">${daysRecorded}<span class="text-lg text-gray-400">/${totalDays}</span></p>
            </div>
            
            <div class="bg-gray-50 p-4 rounded-lg">
                <h3 class="font-medium text-gray-500 mb-1">Ejercicio</h3>
                <p class="text-2xl font-bold">${totalExercise}</p>
            </div>
            
            <div class="bg-gray-50 p-4 rounded-lg">
                <h3 class="font-medium text-gray-500 mb-1">Creatina</h3>
                <p class="text-2xl font-bold">${totalCreatine}</p>
            </div>
            
            <div class="bg-gray-50 p-4 rounded-lg">
                <h3 class="font-medium text-gray-500 mb-1">Pasos</h3>
                <p class="text-2xl font-bold">${totalSteps}</p>
            </div>
            
            <div class="bg-gray-50 p-4 rounded-lg md:col-span-2 lg:col-span-1">
                <h3 class="font-medium text-gray-500 mb-1">Lectura</h3>
                <p class="text-2xl font-bold">${totalReading}</p>
            </div>
        </div>
        
        <div class="mb-6">
            <h3 class="font-semibold mb-3 text-gray-700">Comidas</h3>
            <div class="grid grid-cols-4 gap-2">
                <div class="bg-green-100 text-green-800 p-2 rounded-lg text-center">
                    <div class="text-sm">Perfecto</div>
                    <div class="font-bold">${meals.Perfecto}</div>
                </div>
                <div class="bg-blue-100 text-blue-800 p-2 rounded-lg text-center">
                    <div class="text-sm">Bien</div>
                    <div class="font-bold">${meals.Bien}</div>
                </div>
                <div class="bg-yellow-100 text-yellow-800 p-2 rounded-lg text-center">
                    <div class="text-sm">Normal</div>
                    <div class="font-bold">${meals.Normal}</div>
                </div>
                <div class="bg-red-100 text-red-800 p-2 rounded-lg text-center">
                    <div class="text-sm">Mal</div>
                    <div class="font-bold">${meals.Mal}</div>
                </div>
            </div>
        </div>
        
        ${sportsHTML}
    `;
    
    elements.summaryActivities.innerHTML = summaryHTML;
}

// Funciones de interacción
function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    updateCalendar();
}

function toggleButton(dayNumber, activityType) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const dateKey = getDateKey(year, month, dayNumber);
    
    if (!data[dateKey]) data[dateKey] = {};
    data[dateKey][activityType] = !data[dateKey][activityType];
    
    saveData();
    updateCalendar();
}

function setFood(dayNumber, selectElement) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const dateKey = getDateKey(year, month, dayNumber);
    
    if (!data[dateKey]) data[dateKey] = {};
    data[dateKey].food = selectElement.value;
    
    selectElement.className = `w-full p-2 rounded-lg border border-gray-200 food-select mb-3 ${getFoodClass(selectElement.value)}`;
    
    saveData();
}

function addSport(dayNumber, selectElement) {
    const sport = selectElement.value;
    if (!sport) return;
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const dateKey = getDateKey(year, month, dayNumber);
    
    if (!data[dateKey]) data[dateKey] = {};
    if (!data[dateKey].sports) data[dateKey].sports = [];
    
    if (!data[dateKey].sports.includes(sport)) {
        data[dateKey].sports.push(sport);
        selectElement.value = '';
        saveData();
        updateCalendar();
    }
}

function removeSport(dayNumber, sport) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const dateKey = getDateKey(year, month, dayNumber);
    
    if (data[dateKey] && data[dateKey].sports) {
        data[dateKey].sports = data[dateKey].sports.filter(s => s !== sport);
        saveData();
        updateCalendar();
    }
}

function toggleView() {
    if (currentView === 'calendar') {
        currentView = 'summary';
        elements.calendarView.classList.add('hidden');
        elements.summaryView.classList.remove('hidden');
        elements.toggleIcon.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />`;
        showSummary();
    } else {
        currentView = 'calendar';
        elements.summaryView.classList.add('hidden');
        elements.calendarView.classList.remove('hidden');
        elements.toggleIcon.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />`;
    }
}

// Event listeners
function setupEventListeners() {
    elements.prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    elements.nextMonthBtn.addEventListener('click', () => changeMonth(1));
    elements.toggleViewBtn.addEventListener('click', toggleView);
    elements.backToCalendarBtn.addEventListener('click', toggleView);
}

// Inicialización
function init() {
    data = loadData();
    setupEventListeners();
    updateCalendar();
}

document.addEventListener('DOMContentLoaded', init);

// Hacer funciones accesibles globalmente para los eventos inline
window.toggleButton = toggleButton;
window.setFood = setFood;
window.addSport = addSport;

window.removeSport = removeSport;
