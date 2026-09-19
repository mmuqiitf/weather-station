export type DeviceStatus = "provisioned" | "active" | "decommissioned";

export interface Device {
  id: string;
  device_id: string;
  name: string;
  status: DeviceStatus;
  location: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    altitude_m: number | null;
  } | null;
  last_seen_at: string | null;
  is_online: boolean;
  latest: {
    temp_air: number | null;
    humidity: number | null;
    updated_at: string | null;
  };
}

export interface Paginated<T> {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface TimeSeriesPoint {
  time: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
}
