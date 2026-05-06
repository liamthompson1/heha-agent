export interface Airport {
  id: string    // IATA code
  name: string  // "Heathrow"
  city: string  // "London"
  lat: number
  lng: number
}

export const AIRPORTS: Airport[] = [
  { id: 'LHR', name: 'Heathrow',              city: 'London',        lat: 51.4775,  lng: -0.4614 },
  { id: 'LGW', name: 'Gatwick',               city: 'London',        lat: 51.1537,  lng: -0.1821 },
  { id: 'LCY', name: 'City',                  city: 'London',        lat: 51.5048,  lng:  0.0495 },
  { id: 'STN', name: 'Stansted',              city: 'London',        lat: 51.8850,  lng:  0.2350 },
  { id: 'LTN', name: 'Luton',                 city: 'London',        lat: 51.8747,  lng: -0.3683 },
  { id: 'SOU', name: 'Southampton',           city: 'Southampton',   lat: 50.9503,  lng: -1.3568 },
  { id: 'BOH', name: 'Bournemouth',           city: 'Bournemouth',   lat: 50.7800,  lng: -1.8425 },
  { id: 'EXT', name: 'Exeter',                city: 'Exeter',        lat: 50.7344,  lng: -3.4139 },
  { id: 'NQY', name: 'Newquay Cornwall',      city: 'Newquay',       lat: 50.4406,  lng: -4.9951 },
  { id: 'BRS', name: 'Bristol',               city: 'Bristol',       lat: 51.3827,  lng: -2.7191 },
  { id: 'CWL', name: 'Cardiff',               city: 'Cardiff',       lat: 51.3967,  lng: -3.3433 },
  { id: 'BHX', name: 'Birmingham',            city: 'Birmingham',    lat: 52.4539,  lng: -1.7480 },
  { id: 'EMA', name: 'East Midlands',         city: 'Nottingham',    lat: 52.8311,  lng: -1.3281 },
  { id: 'NWI', name: 'Norwich',               city: 'Norwich',       lat: 52.6758,  lng:  1.2828 },
  { id: 'LPL', name: 'Liverpool John Lennon', city: 'Liverpool',     lat: 53.3336,  lng: -2.8497 },
  { id: 'MAN', name: 'Manchester',            city: 'Manchester',    lat: 53.3537,  lng: -2.2750 },
  { id: 'LBA', name: 'Leeds Bradford',        city: 'Leeds',         lat: 53.8659,  lng: -1.6606 },
  { id: 'DSA', name: 'Doncaster Sheffield',   city: 'Doncaster',     lat: 53.4805,  lng: -1.0106 },
  { id: 'HUY', name: 'Humberside',            city: 'Hull',          lat: 53.5744,  lng: -0.3508 },
  { id: 'BLK', name: 'Blackpool',             city: 'Blackpool',     lat: 53.7728,  lng: -3.0286 },
  { id: 'NCL', name: 'Newcastle',             city: 'Newcastle',     lat: 55.0375,  lng: -1.6917 },
  { id: 'MME', name: 'Durham Tees Valley',    city: 'Durham',        lat: 54.5092,  lng: -1.4294 },
  { id: 'EDI', name: 'Edinburgh',             city: 'Edinburgh',     lat: 55.9500,  lng: -3.3725 },
  { id: 'GLA', name: 'Glasgow International', city: 'Glasgow',       lat: 55.8642,  lng: -4.4331 },
  { id: 'PIK', name: 'Prestwick',             city: 'Glasgow',       lat: 55.5094,  lng: -4.5869 },
  { id: 'DND', name: 'Dundee',                city: 'Dundee',        lat: 56.4525,  lng: -3.0108 },
  { id: 'ABZ', name: 'Aberdeen',              city: 'Aberdeen',      lat: 57.2019,  lng: -2.1978 },
  { id: 'INV', name: 'Inverness',             city: 'Inverness',     lat: 57.5425,  lng: -4.0475 },
  { id: 'WIC', name: 'Wick',                  city: 'Wick',          lat: 58.4589,  lng: -3.0931 },
  { id: 'KOI', name: 'Kirkwall',              city: 'Orkney',        lat: 58.9578,  lng: -2.9050 },
  { id: 'LSI', name: 'Sumburgh',              city: 'Shetland',      lat: 59.8789,  lng: -1.2956 },
  { id: 'SYY', name: 'Stornoway',             city: 'Stornoway',     lat: 58.2156,  lng: -6.3311 },
  { id: 'BEB', name: 'Benbecula',             city: 'Benbecula',     lat: 57.4811,  lng: -7.3628 },
  { id: 'BFS', name: 'Belfast International', city: 'Belfast',       lat: 54.6575,  lng: -6.2158 },
  { id: 'BHD', name: 'Belfast City',          city: 'Belfast',       lat: 54.6181,  lng: -5.8725 },
  { id: 'IOM', name: 'Isle of Man',           city: 'Isle of Man',   lat: 54.0833,  lng: -4.6239 },
  { id: 'JER', name: 'Jersey',                city: 'Jersey',        lat: 49.2079,  lng: -2.1955 },
  { id: 'GCI', name: 'Guernsey',              city: 'Guernsey',      lat: 49.4350,  lng: -2.6014 },
]

function deg2rad(deg: number) { return deg * (Math.PI / 180) }

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = deg2rad(lat2 - lat1)
  const dLng = deg2rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function sortedByDistance(lat: number, lng: number): Airport[] {
  return [...AIRPORTS].sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng))
}

const RECENT_KEY = 'heha_recent_airports'

export function getRecentAirports(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch { return [] }
}

export function saveRecentAirport(iata: string) {
  try {
    const recent = getRecentAirports().filter(id => id !== iata)
    recent.unshift(iata)
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 5)))
  } catch {}
}
