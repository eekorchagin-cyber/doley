import { saveData, uid } from './storage.js';

export function listFuels(data) {
  return data.fuels;
}

export function addFuel(data, name) {
  const fuel = { id: uid('fuel'), name: String(name || '').trim() || 'Топливо' };
  data.fuels.push(fuel);
  saveData(data);
  return fuel;
}

export function updateFuel(data, id, name) {
  const fuel = data.fuels.find((f) => f.id === id);
  if (!fuel) return null;
  fuel.name = String(name || '').trim() || fuel.name;
  saveData(data);
  return fuel;
}

export function deleteFuel(data, id) {
  if (data.fuels.length <= 1) return { ok: false, reason: 'Нужен хотя бы один вид топлива' };
  const used = data.fillups.some((f) => f.fuelId === id);
  if (used) return { ok: false, reason: 'Топливо используется в заправках' };
  data.fuels = data.fuels.filter((f) => f.id !== id);
  saveData(data);
  return { ok: true };
}

export function listNetworks(data) {
  return data.networks;
}

export function addNetwork(data, fields) {
  const network = {
    id: uid('net'),
    name: String(fields.name || '').trim() || 'Сеть',
    logo: fields.logo || '',
  };
  data.networks.push(network);
  saveData(data);
  return network;
}

export function updateNetwork(data, id, fields) {
  const network = data.networks.find((n) => n.id === id);
  if (!network) return null;
  if (fields.name != null) network.name = String(fields.name).trim() || network.name;
  if (fields.logo != null) network.logo = fields.logo;
  saveData(data);
  return network;
}

export function deleteNetwork(data, id) {
  if (data.networks.length <= 1) return { ok: false, reason: 'Нужна хотя бы одна сеть' };
  const usedStations = data.stations.some((s) => s.networkId === id);
  const usedFillups = data.fillups.some((f) => f.networkId === id);
  if (usedStations || usedFillups) {
    return { ok: false, reason: 'Сеть используется в заправках или точках' };
  }
  data.networks = data.networks.filter((n) => n.id !== id);
  saveData(data);
  return { ok: true };
}

export function listStations(data) {
  return data.stations;
}

export function addStation(data, fields) {
  const address = String(fields.address || '').trim();
  if (!address) return null;
  const station = {
    id: uid('station'),
    networkId: fields.networkId,
    address,
  };
  data.stations.push(station);
  saveData(data);
  return station;
}

export function updateStation(data, id, fields) {
  const station = data.stations.find((s) => s.id === id);
  if (!station) return null;
  if (fields.networkId != null) station.networkId = fields.networkId;
  if (fields.address != null) {
    const address = String(fields.address).trim();
    if (address) station.address = address;
  }
  saveData(data);
  return station;
}

export function deleteStation(data, id) {
  const used = data.fillups.some((f) => f.stationId === id);
  if (used) return { ok: false, reason: 'Заправка используется в истории' };
  data.stations = data.stations.filter((s) => s.id !== id);
  saveData(data);
  return { ok: true };
}

export function findDuplicateFillup(data, fields) {
  const odometer = Number(fields.odometer) || 0;
  const stationId = fields.stationId || null;
  return (
    data.fillups.find(
      (f) =>
        f.carId === fields.carId &&
        f.date === fields.date &&
        f.odometer === odometer &&
        (f.stationId || null) === stationId
    ) || null
  );
}

export function addFillup(data, fields) {
  if (findDuplicateFillup(data, fields)) {
    return { ok: false, reason: 'Такая заправка уже сохранена', fillup: null };
  }
  const fillup = {
    id: uid('fill'),
    carId: fields.carId,
    date: fields.date,
    odometer: Number(fields.odometer) || 0,
    rangeKm: Number(fields.rangeKm) || 0,
    consumption: Number(fields.consumption) || 0,
    fuelId: fields.fuelId,
    price: Number(fields.price) || 0,
    networkId: fields.networkId || null,
    stationId: fields.stationId || null,
    litersToFull: Number(fields.litersToFull) || 0,
    cost: Number(fields.cost) || 0,
    litersActual:
      fields.litersActual != null && fields.litersActual !== ''
        ? Number(fields.litersActual)
        : null,
  };
  data.fillups.push(fillup);
  saveData(data);
  return { ok: true, fillup };
}

export function updateFillup(data, id, fields) {
  const fillup = data.fillups.find((f) => f.id === id);
  if (!fillup) return null;
  Object.assign(fillup, {
    date: fields.date ?? fillup.date,
    odometer: fields.odometer != null ? Number(fields.odometer) : fillup.odometer,
    rangeKm: fields.rangeKm != null ? Number(fields.rangeKm) : fillup.rangeKm,
    consumption: fields.consumption != null ? Number(fields.consumption) : fillup.consumption,
    fuelId: fields.fuelId ?? fillup.fuelId,
    price: fields.price != null ? Number(fields.price) : fillup.price,
    networkId: fields.networkId !== undefined ? fields.networkId : fillup.networkId,
    stationId: fields.stationId !== undefined ? fields.stationId : fillup.stationId,
    litersToFull: fields.litersToFull != null ? Number(fields.litersToFull) : fillup.litersToFull,
    cost: fields.cost != null ? Number(fields.cost) : fillup.cost,
    litersActual:
      fields.litersActual === '' || fields.litersActual == null
        ? fields.litersActual === ''
          ? null
          : fillup.litersActual
        : Number(fields.litersActual),
  });
  saveData(data);
  return fillup;
}

export function deleteFillup(data, id) {
  data.fillups = data.fillups.filter((f) => f.id !== id);
  saveData(data);
  return { ok: true };
}

export function fillupsForCar(data, carId) {
  return data.fillups
    .filter((f) => f.carId === carId)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.odometer - a.odometer);
}
