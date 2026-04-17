import fs from 'fs'
import path from 'path'
import process from 'process'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const rootDir = path.resolve('C:/Users/cesar/ruag-asistencias')
const envPath = path.join(rootDir, '.env.local')

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx === -1) return
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    value = value.replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = value
  })
}

function normalizeName(name) {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/\bD\s+AMBROSIO\b/g, 'DAMBROSIO')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function makeSyntheticDni(row) {
  const code = (row.codigo_excel ?? '').toString().trim()
  if (code) return `EXCEL-${code}`
  return `EXCEL-${normalizeName(row.trabajador_nombre).replace(/\s+/g, '-')}`
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[m][n]
}

const STOPWORDS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'DA'])

function nameTokens(name) {
  return normalizeName(name)
    .split(' ')
    .filter((token) => token && !STOPWORDS.has(token) && token.length > 1)
}

function tokenMatches(a, b) {
  if (a === b) return true
  if (a.length >= 5 && b.length >= 5 && levenshtein(a, b) <= 1) return true
  return false
}

function compareNames(excelName, profileName) {
  const excelTokens = nameTokens(excelName)
  const profileTokens = nameTokens(profileName)
  const used = new Set()
  let matched = 0

  for (const excelToken of excelTokens) {
    let foundIndex = -1
    for (let i = 0; i < profileTokens.length; i++) {
      if (used.has(i)) continue
      if (tokenMatches(excelToken, profileTokens[i])) {
        foundIndex = i
        break
      }
    }
    if (foundIndex !== -1) {
      used.add(foundIndex)
      matched++
    }
  }

  const coverageExcel = matched / Math.max(excelTokens.length, 1)
  const coverageProfile = matched / Math.max(profileTokens.length, 1)
  const score = coverageExcel * 0.7 + coverageProfile * 0.3
  const accepted =
    (matched >= 3 && coverageExcel >= 0.6) ||
    (matched >= 3 && coverageProfile >= 0.75) ||
    (matched >= 2 && coverageExcel >= 0.74 && coverageProfile >= 0.5)

  return {
    matched,
    coverageExcel,
    coverageProfile,
    score,
    accepted,
  }
}

function findBestProfile(excelName, profiles) {
  const exactNormalized = normalizeName(excelName)
  const exact = profiles.find((perfil) => normalizeName(perfil.nombres_completos) === exactNormalized)
  if (exact) {
    return { perfil: exact, confidence: 'exacta', score: 1 }
  }

  const ranked = profiles
    .map((perfil) => ({ perfil, ...compareNames(excelName, perfil.nombres_completos) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1]
  if (!best || !best.accepted) return null

  const isAmbiguous =
    second &&
    second.accepted &&
    Math.abs(best.score - second.score) < 0.08 &&
    best.matched === second.matched

  if (isAmbiguous) return null

  return {
    perfil: best.perfil,
    confidence: 'fuzzy',
    score: best.score,
  }
}

function toInt(value) {
  if (value === null || value === undefined || value === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function excelDateToIso(value) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return null
    const year = String(parsed.y).padStart(4, '0')
    const month = String(parsed.m).padStart(2, '0')
    const day = String(parsed.d).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const asDate = new Date(trimmed)
    if (!Number.isNaN(asDate.getTime())) {
      const year = asDate.getUTCFullYear()
      const month = String(asDate.getUTCMonth() + 1).padStart(2, '0')
      const day = String(asDate.getUTCDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  return null
}

function buildRows(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
  const data = []
  let currentArea = ''

  for (const row of rows) {
    const nombre = (row[1] ?? '').toString().trim()
    const cargo = (row[2] ?? '').toString().trim()

    if (!nombre) continue
    if (/^AREA\b/i.test(nombre)) {
      currentArea = nombre.toUpperCase()
      continue
    }
    if (/^EMPLEADOS$/i.test(nombre) || /^REPORTE DE VACACIONES/i.test(nombre)) continue
    if (!cargo) continue

    data.push({
      codigo_excel: (row[0] ?? '').toString().trim() || null,
      trabajador_nombre: nombre.toUpperCase(),
      cargo: cargo.toUpperCase(),
      area: currentArea || null,
      saldo_arrastre: toInt(row[3]),
      gozados_ene: toInt(row[4]),
      gozados_feb: toInt(row[5]),
      gozados_mar: toInt(row[6]),
      gozados_abr: toInt(row[7]),
      gozados_may: toInt(row[8]),
      gozados_jun: toInt(row[9]),
      gozados_jul: toInt(row[10]),
      gozados_ago: toInt(row[11]),
      gozados_set: toInt(row[12]),
      gozados_oct: toInt(row[13]),
      gozados_nov: toInt(row[14]),
      gozados_dic: toInt(row[15]),
      total_gozados: toInt(row[16]),
      dias_pendientes: toInt(row[17]),
      fecha_vencimiento: excelDateToIso(row[18]),
      vacaciones_por_vencer: toInt(row[19]),
      vacaciones_pendientes_periodo: toInt(row[20]) || (toInt(row[17]) + toInt(row[19])),
    })
  }

  return data
}

async function main() {
  loadEnv(envPath)

  const workbookPath = process.argv[2] || 'C:/Users/cesar/Downloads/119 Control de vacaciones al 07.04.26 RGA.xlsx'
  const periodo = Number(process.argv[3] || process.env.VACACIONES_PERIODO || 2026)
  const fechaVencimientoFallback =
    process.argv[4] ||
    process.env.VACACIONES_DEFAULT_VENCIMIENTO ||
    `${periodo}-12-31`

  if (!fs.existsSync(workbookPath)) {
    throw new Error(`No se encontró el Excel: ${workbookPath}`)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  }

  const supabase = createClient(url, serviceKey)
  const workbook = XLSX.readFile(workbookPath)
  const sheetName = `vacaciones ${periodo}`
  const sheet = workbook.Sheets[sheetName]

  if (!sheet) {
    throw new Error(`No existe la hoja '${sheetName}' en el Excel`)
  }

  const excelRows = buildRows(sheet)
  const [{ data: perfiles, error: perfilesError }, { data: existingVacaciones, error: existingVacacionesError }] = await Promise.all([
    supabase
      .from('fotocheck_perfiles')
      .select('dni, nombres_completos, area'),
    supabase
      .from('vacaciones_saldos')
      .select('id, dni, trabajador_nombre')
      .eq('periodo', periodo),
  ])

  if (perfilesError) throw perfilesError
  if (existingVacacionesError) throw existingVacacionesError

  const existingByName = new Map()
  for (const item of existingVacaciones ?? []) {
    const key = normalizeName(item.trabajador_nombre)
    const current = existingByName.get(key)
    if (!current || String(current.dni).startsWith('EXCEL-')) {
      existingByName.set(key, item)
    }
  }

  const matched = []
  const unmatched = []
  const importedWithoutProfile = []
  const placeholderProfiles = []
  const desiredDniByName = new Map()

  for (const row of excelRows) {
    const match = findBestProfile(row.trabajador_nombre, perfiles ?? [])
    const existing = existingByName.get(normalizeName(row.trabajador_nombre))
    const dni = match?.perfil.dni || existing?.dni || makeSyntheticDni(row)
    desiredDniByName.set(normalizeName(row.trabajador_nombre), dni)
    matched.push({
      dni,
      trabajador_nombre: row.trabajador_nombre,
      area: row.area || match?.perfil.area || null,
      cargo: row.cargo,
      codigo_excel: row.codigo_excel,
      periodo,
      saldo_arrastre: row.saldo_arrastre,
      dias_extra: 0,
      gozados_ene: row.gozados_ene,
      gozados_feb: row.gozados_feb,
      gozados_mar: row.gozados_mar,
      gozados_abr: row.gozados_abr,
      gozados_may: row.gozados_may,
      gozados_jun: row.gozados_jun,
      gozados_jul: row.gozados_jul,
      gozados_ago: row.gozados_ago,
      gozados_set: row.gozados_set,
      gozados_oct: row.gozados_oct,
      gozados_nov: row.gozados_nov,
      gozados_dic: row.gozados_dic,
      total_gozados: row.total_gozados,
      dias_pendientes: row.dias_pendientes,
      fecha_vencimiento: row.fecha_vencimiento || fechaVencimientoFallback,
      vacaciones_por_vencer: row.vacaciones_por_vencer,
      vacaciones_pendientes_periodo: row.vacaciones_pendientes_periodo,
    })

    if (!match) {
      unmatched.push(row.trabajador_nombre)
      importedWithoutProfile.push(row.trabajador_nombre)
      placeholderProfiles.push({
        dni,
        nombres_completos: row.trabajador_nombre,
        area: row.area || 'SIN AREA',
        foto_url: '',
      })
    }
  }

  if (!matched.length) {
    throw new Error('No hubo coincidencias entre el Excel y fotocheck_perfiles')
  }

  if (placeholderProfiles.length) {
    const { error: profilesUpsertError } = await supabase
      .from('fotocheck_perfiles')
      .upsert(placeholderProfiles, { onConflict: 'dni' })

    if (profilesUpsertError) throw profilesUpsertError
  }

  const { error: upsertError } = await supabase
    .from('vacaciones_saldos')
    .upsert(matched, { onConflict: 'dni,periodo' })

  if (upsertError) throw upsertError

  const duplicateRowsToDelete = (existingVacaciones ?? []).filter((item) => {
    const desiredDni = desiredDniByName.get(normalizeName(item.trabajador_nombre))
    return desiredDni && desiredDni !== item.dni
  })

  if (duplicateRowsToDelete.length) {
    const { error: deleteError } = await supabase
      .from('vacaciones_saldos')
      .delete()
      .in('id', duplicateRowsToDelete.map((item) => item.id))

    if (deleteError) throw deleteError
  }

  console.log(`Importados: ${matched.length}`)
  console.log(`Sin match: ${unmatched.length}`)
  if (unmatched.length) {
    console.log('Trabajadores importados sin match en fotocheck_perfiles:')
    importedWithoutProfile.forEach((name) => console.log(`- ${name}`))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
