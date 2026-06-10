// ============================================================================
// ANALYTICS — Event tracking + CSV export
// ============================================================================

const events = [];

export const track = (eventType, data = {}) => {
  events.push({
    type: eventType,
    data,
    timestamp: new Date().toISOString()
  });
};

export const getSummary = () => {
  return {
    totalMessages: events.filter(e => e.type === 'message_sent').length,
    projectsMentioned: [...new Set(
      events
        .filter(e => e.type === 'project_detected')
        .map(e => e.data.project)
    )],
    tasksCompleted: events.filter(e => e.type === 'task_completed').length,
  };
};

export const downloadCSV = () => {
  const header = ['Timestamp', 'Event Type', 'Data'];
  const rows = events.map(e => [
    e.timestamp,
    e.type,
    JSON.stringify(e.data)
  ]);

  const csv = [
    header,
    ...rows
  ].map(row =>
    row.map(cell => {
      const str = String(cell);
      return '"' + str.replace(/"/g, '""') + '"';
    }).join(',')
  ).join('\r\n');

  // Add UTF-8 BOM for Excel
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `analytics-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};