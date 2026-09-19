import { saveData, uid, getActiveCar } from './storage.js';

export function listCars(data) {
  return data.cars;
}

export function setActiveCar(data, carId) {
  if (!data.cars.some((c) => c.id === carId)) return data;
  data.activeCarId = carId;
  saveData(data);
  return data;
}

export function addCar(data, fields) {
  const car = {
    id: uid('car'),
    name: fields.name?.trim() || 'Автомобиль',
    plate: fields.plate?.trim() || '',
    color: fields.color || '#1a3a5c',
    image: fields.image || '',
    tankCapacity: Number(fields.tankCapacity) || 71,
  };
  data.cars.push(car);
  if (!data.activeCarId) data.activeCarId = car.id;
  saveData(data);
  return car;
}

export function updateCar(data, carId, fields) {
  const car = data.cars.find((c) => c.id === carId);
  if (!car) return null;
  if (fields.name != null) car.name = String(fields.name).trim() || car.name;
  if (fields.plate != null) car.plate = String(fields.plate).trim();
  if (fields.color != null) car.color = fields.color;
  if (fields.image != null) car.image = fields.image;
  if (fields.tankCapacity != null) car.tankCapacity = Number(fields.tankCapacity) || car.tankCapacity;
  saveData(data);
  return car;
}

export function deleteCar(data, carId) {
  if (data.cars.length <= 1) return { ok: false, reason: 'Нужен хотя бы один автомобиль' };
  data.cars = data.cars.filter((c) => c.id !== carId);
  data.fillups = data.fillups.filter((f) => f.carId !== carId);
  delete data.lastInputs[carId];
  if (data.activeCarId === carId) data.activeCarId = data.cars[0].id;
  saveData(data);
  return { ok: true };
}

export { getActiveCar };
