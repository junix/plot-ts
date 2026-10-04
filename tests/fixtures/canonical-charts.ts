import type { figure } from '../../src/svg/index.js'

export function addAllSvgCharts(chart: ReturnType<typeof figure>) {
  return chart
    .bar({ categories: ['A', 'B'], series: Array.from({ length: 8 }, (_, i) => ({ values: [20 + i, 40 - i] })), yAxis: true })
    .line({ x: [0, 1, 2], series: [{ y: [4, 8, 6], area: true }, { y: [8, 3, 4] }], yAxis: true })
    .scatter({ points: [{ x: 1, y: 3, size: 12 }, { x: 2, y: 7, size: 8 }], yAxis: true })
    .heatmap({ data: [[1, 4], [3, 9]], xLabels: ['A', 'B'], yLabels: ['Alpha', 'Beta'] })
    .waterfall({ categories: ['Start', 'Gain', 'Loss'], values: [20, 10, -5] })
    .donut({ items: [{ name: 'Alpha', value: 55 }, { name: 'Beta', value: 45 }] })
    .radar({ axes: ['Quality', 'Speed', 'Value'].map(name => ({ name, max: 10 })), series: [{ values: [8, 6, 9] }] })
    .gauge({ value: 72, max: 100, unit: '%' })
    .slope({ leftTitle: 'Before', rightTitle: 'After', items: [{ name: 'Alpha', left: 20, right: 45 }] })
    .pyramid({ layers: [{ name: 'Visitors', value: 100 }, { name: 'Customers', value: 35 }] })
}

