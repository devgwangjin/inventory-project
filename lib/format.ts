/**
 * Structured note builder and parser for projects and shipments
 */

export interface ParsedProjectNote {
  manager: string
  deliveryTime: string
  address: string
  note: string
}

export function buildCombinedNote(manager: string, deliveryTime: string, address: string, userNote: string): string {
  const parts: string[] = []
  if (manager.trim()) parts.push(`[담당: ${manager.trim()}]`)
  if (deliveryTime.trim()) parts.push(`[납품시간: ${deliveryTime.trim()}]`)
  if (address.trim()) parts.push(`[주소: ${address.trim()}]`)
  if (userNote.trim()) parts.push(userNote.trim())
  return parts.join(' ')
}

export function parseCombinedNote(fullNote: string): ParsedProjectNote {
  let manager = ''
  let deliveryTime = ''
  let address = ''
  let note = fullNote || ''

  if (!fullNote) return { manager, deliveryTime, address, note }

  const managerMatch = fullNote.match(/\[담당:\s*([^\]]+)\]/)
  if (managerMatch) {
    manager = managerMatch[1]
    note = note.replace(managerMatch[0], '')
  }

  const deliveryMatch = fullNote.match(/\[납품시간:\s*([^\]]+)\]/)
  if (deliveryMatch) {
    deliveryTime = deliveryMatch[1]
    note = note.replace(deliveryMatch[0], '')
  }

  const addressMatch = fullNote.match(/\[주소:\s*([^\]]+)\]/)
  if (addressMatch) {
    address = addressMatch[1]
    note = note.replace(addressMatch[0], '')
  }

  note = note.trim()
  return { manager, deliveryTime, address, note }
}
