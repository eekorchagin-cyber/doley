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

export function listStations(data) {
  return data.stations;
}

export function addStation(data, fields) {
  const station = {
    id: uid('station'),
    name: String(fields.name || '').trim() || 'АЗС',
    address: String(fields.address || '').trim(),
    logo: fields.logo || '',
  };
  data.stations.push(station);
  saveData(data);
  return station;
}

export function updateStation(data, id, fields) {
  const station = data.stations.find((s) => s.id === id);
  if (!station) return null;
  if (fields.name != null) station.name = String(fields.name).trim() || station.name;
  if (fields.address != null) station.address = String(fields.address).trim();
  if (fields.logo != null) station.logo = fields.logo;
  saveData(data);
  return station;
}

export function deleteStation(data, id) {
  if (data.stations.length <= 1) return { ok: false, reason: 'Нужна хотя бы одна сеть АЗС' };
  const used = data.fillups.some((f) => f.stationId === id);
  if (used) return { ok: false, reason: 'Сеть используется в заправках' };
  data.stations = data.stations.filter((s) => s.id !== id);
  saveData(data);
  return { ok: true };
}

export function addFillup(data, fields) {
  const fillup = {
    id: uid('fill'),
    carId: fields.carId,
    date: fields.date,
    odometer: Number(fields.odometer) || 0,
    rangeKm: Number(fields.rangeKm) || 0,
    consumption: Number(fields.consumption) || 0,
    fuelId: fields.fuelId,
    price: Number(fields.price) || 0,
    stationId: fields.stationId,
    litersToFull: Number(fields.litersToFull) || 0,
    cost: Number(fields.cost) || 0,
    litersActual: fields.litersActual != null && fields.litersActual !== ''
      ? Number(fields.litersActual)
      : null,
  };
  data.fillups.push(fillup);
  saveData(data);
  return fillup;
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
    stationId: fields.stationId ?? fillup.stationId,
    litersToFull: fields.litersToFull != null ? Number(fields.litersToFull) : fillup.litersToFull,
    cost: fields.cost != null ? Number(fields.cost) : fillup.cost,
    litersActual:
      fields.litersActual === '' || fields.litersActual == null
        ? null
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
