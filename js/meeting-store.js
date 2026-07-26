export function meetingFromRecord(record) {
  if (!record?.settings) throw new Error('會議資料格式不完整。');
  return {
    meeting_id: record.meeting_id,
    ...record.settings,
  };
}

export function responsesFromRecord(record) {
  return Object.values(record?.responses || {})
    .map((response) => ({
      participant_name: response.participant_name || '未命名',
      availability: Object.keys(response.availability || {}).filter((key) => response.availability[key]),
      note: response.note || '',
      submitted_at: response.updated_at || 0,
    }))
    .sort((a, b) => a.participant_name.localeCompare(b.participant_name, 'zh-Hant'));
}

export function buildSlotStatistics(slots, responses, finalSlot = '') {
  const total = responses.length;

  return slots.map((slot) => {
    const matched = responses.filter((response) => response.availability.includes(slot.key));
    const availableCount = matched.length;

    return {
      ...slot,
      slot_key: slot.key,
      available_count: availableCount,
      total_participants: total,
      available_rate: total === 0 ? 0 : Math.round((availableCount / total) * 100),
      participant_names: matched.map((response) => response.participant_name),
      is_all_available: total > 0 && availableCount === total,
      is_final_slot: slot.key === finalSlot,
    };
  });
}

export function getRecommendedSlots(statistics, limit = 3) {
  return [...statistics]
    .sort((a, b) => {
      if (b.available_count !== a.available_count) return b.available_count - a.available_count;
      if (b.available_rate !== a.available_rate) return b.available_rate - a.available_rate;
      return a.slot_key.localeCompare(b.slot_key);
    })
    .slice(0, limit);
}
