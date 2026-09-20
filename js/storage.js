import { createDefaultNetworks, DEFAULT_NETWORKS } from './station-networks.js';

const STORAGE_KEY = 'doley:v1';
const SCHEMA_VERSION = 3;

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
    networks: createDefaultNetworks(uid),
    stations: [],
    fillups: [],
    lastInputs: {},
  };
}

function seedMissingNetworks(data) {
  if (!Array.isArray(data.networks)) data.networks = [];
  const names = new Set(data.networks.map((n) => n.name.toLowerCase()));
  for (const def of DEFAULT_NETWORKS) {
    if (!names.has(def.name.toLowerCase())) {
      data.networks.push({
        id: uid('net'),
        name: def.name,
        logo: def.logo,
      });
    }
  }
}

/** v1/v2: stations были и сетями, и точками → разделить */
function migrateToNetworksAndStations(data) {
  if (Array.isArray(data.networks) && data.schemaVersion >= 3) {
    seedMissingNetworks(data);
    if (!Array.isArray(data.stations)) data.stations = [];
    return data;
  }

  const oldStations = Array.isArray(data.stations) ? data.stations : [];
  const networks = [];
  const stations = [];
  const oldIdToNetworkId = {};

  const onlyPlaceholder =
    oldStations.length === 0 ||
    (oldStations.length === 1 &&
      (!oldStations[0].logo || oldStations[0].name === 'Заправка'));

  if (onlyPlaceholder) {
    data.networks = createDefaultNetworks(uid);
    data.stations = [];
    seedMissingNetworks(data);
    return data;
  }

  for (const s of oldStations) {
    const hasAddress = Boolean(String(s.address || '').trim());
    if (hasAddress && !s.isNetwork) {
      let net = networks.find((n) => n.name.toLowerCase() === String(s.name || '').toLowerCase());
      if (!net) {
        net = {
          id: uid('net'),
          name: s.name || 'Сеть',
          logo: s.logo || '',
        };
        networks.push(net);
      }
      stations.push({
        id: s.id,
        networkId: net.id,
        address: String(s.address).trim(),
      });
      oldIdToNetworkId[s.id] = net.id;
    } else {
      const net = {
        id: s.id,
        name: s.name || 'Сеть',
        logo: s.logo || '',
      };
      networks.push(net);
      oldIdToNetworkId[s.id] = net.id;
    }
  }

  data.networks = networks;
  data.stations = stations;
  seedMissingNetworks(data);

  // fillups: старый stationId мог указывать на сеть
  if (Array.isArray(data.fillups)) {
    data.fillups.forEach((f) => {
      const sid = f.stationId;
      const asStation = stations.find((st) => st.id === sid);
      if (asStation) {
        f.networkId = asStation.networkId;
        return;
      }
      const netId = oldIdToNetworkId[sid];
      if (netId) {
        f.networkId = netId;
        f.stationId = null;
      }
    });
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

  migrateToNetworksAndStations(next);
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

export function setLastInputs(data, carId, inputs, options = {}) {
  const prev = data.lastInputs[carId] || {};
  const next = { ...prev, ...inputs };
  // Пустые одометр/расход не затирают ранее запомненные значения —
  // кроме явного сброса после сохранения заправки.
  if (!options.clearTripFields) {
    if (inputs.odometer === '' || inputs.odometer == null) {
      next.odometer = prev.odometer ?? '';
    }
    if (inputs.consumption === '' || inputs.consumption == null) {
      next.consumption = prev.consumption ?? '';
    }
  }
  data.lastInputs[carId] = next;
  saveData(data);
}

export function getNetwork(data, networkId) {
  return data.networks.find((n) => n.id === networkId) || null;
}

export function getStation(data, stationId) {
  return data.stations.find((s) => s.id === stationId) || null;
}

export function stationsByNetwork(data, networkId) {
  return data.stations.filter((s) => s.networkId === networkId);
}

export function stationLabel(data, station) {
  if (!station) return '—';
  const net = getNetwork(data, station.networkId);
  const netName = net?.name || 'Сеть';
  return station.address ? `${netName} — ${station.address}` : netName;
}

export { uid, STORAGE_KEY };
