import { networkStations } from './station-networks.js';

const STORAGE_KEY = 'doley:v1';
const SCHEMA_VERSION = 2;

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultData() {
  const carId = uid('car');
  const fuel95 = uid('fuel');
  const fuel98 = uid('fuel');

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
    stations: networkStations(uid),
    fillups: [],
    lastInputs: {},
  };
}

function seedNetworksIfNeeded(data) {
  if (!Array.isArray(data.stations)) data.stations = [];

  const onlyPlaceholder =
    data.stations.length === 0 ||
    (data.stations.length === 1 &&
      (!data.stations[0].logo || data.stations[0].name === 'Заправка'));

  if (onlyPlaceholder) {
    const oldId = data.stations[0]?.id;
    data.stations = networkStations(uid);
    if (oldId && data.fillups?.length) {
      const firstId = data.stations[0].id;
      data.fillups.forEach((f) => {
        if (f.stationId === oldId) f.stationId = firstId;
      });
    }
    return data;
  }

  // Дополнить отсутствующие сети по имени, не трогая пользовательские
  const names = new Set(data.stations.map((s) => s.name.toLowerCase()));
  for (const net of networkStations(uid)) {
    if (!names.has(net.name.toLowerCase())) {
      data.stations.push(net);
    }
  }
  return data;
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
  if (!Array.isArray(next.fillups)) next.fillups = [];
  if (!next.lastInputs || typeof next.lastInputs !== 'object') next.lastInputs = {};

  seedNetworksIfNeeded(next);
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
    const data = migrate(JSON.parse(raw));
    saveData(data);
    return data;
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
