const STORAGE_KEY = 'doley:v1';
const SCHEMA_VERSION = 1;

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultData() {
  const carId = uid('car');
  const fuel95 = uid('fuel');
  const fuel98 = uid('fuel');
  const stationId = uid('station');

  return {
    schemaVersion: SCHEMA_VERSION,
    activeCarId: carId,
    cars: [
      {
        id: carId,
        name: 'Volvo XC60',
        plate: '',
        color: '#1a3a5c',
        image: '',
        tankCapacity: 71,
      },
    ],
    fuels: [
      { id: fuel95, name: 'АИ-95 Plus' },
      { id: fuel98, name: 'АИ-98' },
    ],
    stations: [
      {
        id: stationId,
        name: 'Заправка',
        address: '',
        logo: '',
      },
    ],
    fillups: [],
    lastInputs: {},
  };
}

function migrate(data) {
  if (!data || typeof data !== 'object') return defaultData();
  const next = { ...defaultData(), ...data };
  if (!Array.isArray(next.cars) || next.cars.length === 0) {
    const fresh = defaultData();
    next.cars = fresh.cars;
    next.activeCarId = fresh.activeCarId;
  }
  if (!next.activeCarId || !next.cars.some((c) => c.id === next.activeCarId)) {
    next.activeCarId = next.cars[0].id;
  }
  if (!Array.isArray(next.fuels)) next.fuels = defaultData().fuels;
  if (!Array.isArray(next.stations)) next.stations = defaultData().stations;
  if (!Array.isArray(next.fillups)) next.fillups = [];
  if (!next.lastInputs || typeof next.lastInputs !== 'object') next.lastInputs = {};
  next.schemaVersion = SCHEMA_VERSION;
  return next;
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const data = defaultData();
      saveData(data);
      return data;
    }
    return migrate(JSON.parse(raw));
  } catch {
    const data = defaultData();
    saveData(data);
    return data;
  }
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportJson(data) {
  return JSON.stringify(data, null, 2);
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  const data = migrate(parsed);
  saveData(data);
  return data;
}

export function getActiveCar(data) {
  return data.cars.find((c) => c.id === data.activeCarId) || data.cars[0];
}

export function getLastInputs(data, carId) {
  return data.lastInputs[carId] || null;
}

export function setLastInputs(data, carId, inputs) {
  data.lastInputs[carId] = { ...inputs };
  saveData(data);
}

export { uid, STORAGE_KEY };
