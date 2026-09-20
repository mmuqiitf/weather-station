export type DeviceStatus = "provisioned" | "active" | "decommissioned"

export interface DeviceLocation {
  id: number
  name: string
  latitude: number
  longitude: number
  altitude_m: number | null
}

export interface DeviceDetail {
  id: number
  device_id: string
  name: string
  status: DeviceStatus
  is_online: boolean
  last_seen_at: string | null
  firmware_version: string | null
  location: DeviceLocation | null
}

export interface OverviewDevice {
  id: number
  device_id: string
  name: string
  status: DeviceStatus
  is_online: boolean
  location: string | null
  temp_air: number | null
  humidity: number | null
  last_seen_at: string | null
}

export interface Overview {
  devices: OverviewDevice[]
  counts: { total: number; online: number; offline: number }
}

export interface LatestSensor {
  sensor_type: string
  unit: string
  raw_value: number
  value: number
  quality: string
  device_time: string
}

export interface LatestResponse {
  device_id: string
  is_online: boolean
  last_seen_at: string | null
  sensors: LatestSensor[]
}

export interface SeriesPoint {
  t: string
  sensor_type: string
  v: number
  n?: number
  q?: string
}

export interface ReadingsMeta {
  interval_requested: string
  interval_applied: string
  agg: string
  pagination?: {
    current_page: number
    per_page: number
    total: number
    last_page: number
  }
}

export interface Summary {
  device_id: string
  from: string
  to: string
  temp_min: number | null
  temp_max: number | null
  temp_avg: number | null
  rain_total_mm: number
  wind_max: number | null
}

export interface SensorType {
  id: number
  code: string
  unit: string
  min_value: number | null
  max_value: number | null
  precision: number
  sensors_count?: number
}

export interface Sensor {
  id: number
  serial: string
  sensor_type_id: number
  sensor_type?: string
  current_device_id?: number | null
}

export interface Calibration {
  id: number
  sensor_id: number
  offset: number | null
  scale: number | null
  effective_at: string
}

export interface Installation {
  id: number
  sensor_id: number
  device_id: number
  installed_at: string | null
  removed_at: string | null
}
