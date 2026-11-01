// Stroke plans: the exact writing flow for specific artworks, authored by
// hand in the standard stroke order (Arch Chinese, 12 rules) — the same idea
// as tracing write-on mask paths in After Effects, but as data.
//
// Coordinates are in each artwork's own pixel grid (`grid` = the ink's
// bounding box in that grid), so they survive any crop, padding or scale of
// the image. At run time the engine maps them onto the uploaded image, snaps
// every point to the ink's centre line and only uses the plan when its paths
// actually lie on the ink (otherwise it falls back to automatic analysis).
//
// Each movement lists the standard strokes it covers (`std`), so running-
// script ligatures stay traceable to the textbook order. `flow: true` means
// the brush does not lift before this movement (連筆).
//
// Rule numbers (archchinese.com/chinese_stroke_order_rules.html):
//  1 top→bottom   2 left→right   3 horizontal before vertical
//  4 撇 before 捺  5 outside before inside   6 inside before outside (辶)
//  7 inside before closing bottom   8 centre before wings
//  9 cutting strokes last   10 left vertical before enclosing
//  11 top / upper-left dots first   12 inside / upper-right dots last

export const STROKE_PLANS = [
  {
    id: 'anshin', word: '安心', ko: '안심', meaning: 'Peace of mind',
    status: 'verified', // checked against the artwork (screen recording, 2026-11-02)
    grid: { x0: 0, y0: 0, x1: 1, y1: 1 }, aspect: 2.118, // normalised to the ink box
    strokes: [
      { char: '安', std: ['丶'], name: '점', rules: [1, 11],
        path: [[.214, .022], [.223, .09], [.232, .159], [.252, .264]] },
      { char: '安', std: ['丶', '㇇'], name: '점 → 가로 갈고리 (宀)', rules: [11, 2],
        path: [[.075, .36], [.07, .45], [.113, .412], [.163, .347], [.222, .292], [.28, .248], [.342, .212], [.405, .2], [.425, .213], [.41, .24], [.395, .268], [.379, .285]] },
      { char: '安', std: ['㇛'], name: '삐침점 (女 ㄑ)', rules: [1, 4],
        path: [[.265, .371], [.267, .451], [.257, .529], [.266, .61], [.299, .714], [.303, .794], [.318, .874], [.343, .932]] },
      { char: '安', std: ['丿'], name: '삐침 (女)', rules: [4],
        path: [[.36, .575], [.3, .6], [.235, .618], [.15, .645], [.06, .7], [.12, .77], [.17, .83]] },
      { char: '安', std: ['一'], name: '가로 → 心으로 연결 (女 一)', rules: [1, 2],
        path: [[.25, .625], [.362, .628], [.467, .613], [.5, .638]] },
      { char: '心', std: ['丶'], name: '첫 점 (연필로 이어짐)', rules: [11], flow: true,
        path: [[.515, .585], [.53, .615], [.54, .65]] },
      { char: '心', std: ['㇂'], name: '와구 (卧钩)', rules: [2],
        path: [[.578, .36], [.585, .45], [.59, .56], [.62, .66], [.68, .76], [.73, .84], [.745, .87], [.72, .78], [.7, .7]] },
      { char: '心', std: ['丶'], name: '가운데 점', rules: [12],
        path: [[.682, .52], [.695, .545], [.71, .56]] },
      { char: '心', std: ['丶'], name: '오른쪽 점 (연필)', rules: [12], flow: true,
        path: [[.75, .555], [.8, .49], [.86, .455], [.92, .47], [.95, .5]] },
    ],
  },
  {
    id: 'benri', word: '便利', ko: '편리', meaning: 'Convenience',
    status: 'draft', // authored from the shared image; calibrate with the original file
    grid: { x0: 30, y0: 40, x1: 1725, y1: 1095 },
    strokes: [
      { char: '便', std: ['丿'], name: '亻 삐침', rules: [1, 2], path: [[375, 160], [250, 250], [120, 330], [40, 370]] },
      { char: '便', std: ['丨'], name: '亻 세로', rules: [1], path: [[245, 285], [235, 500], [225, 750], [215, 930]] },
      { char: '便', std: ['一'], name: '更 첫 가로', rules: [1, 3], path: [[495, 45], [590, 110], [680, 195]] },
      { char: '便', std: ['丨'], name: '曰 왼쪽 세로', rules: [10], path: [[415, 290], [420, 420], [430, 540]] },
      { char: '便', std: ['𠃍'], name: '曰 가로 꺾음', rules: [10], path: [[430, 285], [600, 290], [760, 330], [770, 460]] },
      { char: '便', std: ['一'], name: '曰 가운데 가로', rules: [7], path: [[430, 380], [600, 385], [760, 400]] },
      { char: '便', std: ['一'], name: '曰 아래 가로 (닫기)', rules: [7], path: [[430, 475], [600, 470], [770, 470]] },
      { char: '便', std: ['丿'], name: '更 삐침', rules: [4], path: [[600, 300], [600, 500], [580, 640], [540, 760]] },
      { char: '便', std: ['㇏'], name: '更 파임', rules: [4], path: [[380, 540], [520, 650], [700, 780], [950, 860], [1290, 905]] },
      { char: '利', std: ['丿'], name: '禾 첫 삐침', rules: [1, 11], path: [[1185, 110], [1150, 200], [1100, 320]] },
      { char: '利', std: ['一'], name: '禾 가로', rules: [3], path: [[810, 410], [1100, 420], [1500, 430]] },
      { char: '利', std: ['丨'], name: '禾 세로', rules: [3, 8], path: [[1235, 330], [1245, 500], [1250, 690]] },
      { char: '利', std: ['丿'], name: '禾 삐침', rules: [4, 8], path: [[1220, 440], [1150, 500], [1070, 560]] },
      { char: '利', std: ['丶'], name: '禾 점', rules: [4, 8], path: [[1330, 350], [1380, 420], [1420, 470]] },
      { char: '利', std: ['丨'], name: '刂 짧은 세로', rules: [2], path: [[1460, 290], [1480, 380], [1500, 470]] },
      { char: '利', std: ['亅'], name: '刂 갈고리', rules: [2], path: [[1555, 245], [1600, 500], [1630, 800], [1640, 1050], [1560, 1060]] },
    ],
  },
  {
    id: 'shinrai', word: '信頼', ko: '신뢰', meaning: 'Trust',
    status: 'draft',
    grid: { x0: 25, y0: 0, x1: 1975, y1: 1370 },
    strokes: [
      { char: '信', std: ['丿'], name: '亻 삐침', rules: [1, 2], path: [[470, 288], [330, 430], [180, 570], [55, 690]] },
      { char: '信', std: ['丨'], name: '亻 세로', rules: [1], path: [[393, 395], [392, 700], [398, 1000], [402, 1160]] },
      { char: '信', std: ['丶'], name: '言 점', rules: [11], path: [[718, 35], [724, 170], [720, 315]] },
      { char: '信', std: ['一'], name: '言 첫 가로', rules: [1], path: [[552, 300], [700, 385], [848, 462]] },
      { char: '信', std: ['一', '一'], name: '言 두·세 번째 가로 (연필)', rules: [1], path: [[585, 535], [690, 560], [765, 588], [700, 640], [648, 698]] },
      { char: '信', std: ['丨'], name: '口 왼쪽 세로', rules: [10], path: [[790, 705], [800, 850], [812, 985]] },
      { char: '信', std: ['𠃍', '一'], name: '口 꺾음 + 닫기', rules: [10, 7], path: [[655, 700], [800, 725], [952, 758], [890, 870], [822, 985]] },
      { char: '頼', std: ['一'], name: '束 가로', rules: [1, 3], path: [[1040, 428], [1180, 455], [1330, 482]] },
      { char: '頼', std: ['丨'], name: '束 口 왼쪽 세로', rules: [10], path: [[1050, 560], [1052, 700], [1058, 880]] },
      { char: '頼', std: ['𠃍'], name: '束 口 꺾음', rules: [10], path: [[1058, 570], [1230, 600], [1385, 650], [1375, 780]] },
      { char: '頼', std: ['一'], name: '束 口 닫기', rules: [7], path: [[1080, 790], [1230, 805], [1370, 790]] },
      { char: '頼', std: ['丨'], name: '束 꿰뚫는 세로', rules: [9], path: [[1215, 290], [1225, 500], [1240, 800], [1250, 1100], [1250, 1360]] },
      { char: '頼', std: ['丿'], name: '束 삐침', rules: [4], path: [[1150, 830], [1090, 900], [1040, 950]] },
      { char: '頼', std: ['丶'], name: '束 점', rules: [4], path: [[1180, 860], [1260, 900]] },
      { char: '頼', std: ['一', '丿'], name: '頁 첫 가로 + 삐침', rules: [1], path: [[1360, 370], [1480, 380], [1610, 378], [1590, 420], [1570, 440]] },
      { char: '頼', std: ['丨'], name: '目 왼쪽 세로', rules: [10], path: [[1375, 380], [1390, 600], [1405, 850]] },
      { char: '頼', std: ['𠃍'], name: '目 꺾음', rules: [10], path: [[1420, 480], [1560, 500], [1670, 560], [1680, 760]] },
      { char: '頼', std: ['一', '一'], name: '目 안 가로', rules: [7], path: [[1430, 580], [1550, 600], [1660, 640], [1440, 700], [1560, 720], [1670, 770]] },
      { char: '頼', std: ['一'], name: '目 닫기', rules: [7], path: [[1450, 830], [1560, 840], [1670, 830]] },
      { char: '頼', std: ['丿'], name: '頁 왼 다리', rules: [4], path: [[1480, 850], [1460, 950], [1430, 1010]] },
      { char: '頼', std: ['丶'], name: '頁 오른 다리 (파임)', rules: [4], path: [[1690, 840], [1790, 1000], [1880, 1180], [1965, 1340]] },
    ],
  },
  {
    id: 'anzen', word: '安全', ko: '안전', meaning: 'Safety',
    status: 'draft',
    grid: { x0: 40, y0: 25, x1: 1975, y1: 1080 },
    strokes: [
      { char: '安', std: ['丶'], name: '점', rules: [1, 11], path: [[300, 40], [400, 110], [505, 185]] },
      { char: '安', std: ['丶', '㇇'], name: '점 → 가로 갈고리 (宀)', rules: [11, 2], path: [[115, 355], [120, 450], [190, 420], [400, 300], [650, 190], [880, 145], [910, 170], [840, 240], [780, 320]] },
      { char: '安', std: ['㇛'], name: '삐침점 (女 ㄑ)', rules: [1, 4], path: [[550, 390], [480, 520], [420, 640], [520, 760], [650, 900], [760, 1050]] },
      { char: '安', std: ['丿'], name: '삐침 (女)', rules: [4], path: [[720, 600], [620, 760], [520, 900]] },
      { char: '安', std: ['一'], name: '가로 (고리 → 全으로 연결)', rules: [1, 2], path: [[600, 620], [350, 660], [70, 790], [180, 930], [420, 1000], [560, 950]] },
      { char: '全', std: ['丿'], name: '人 삐침', rules: [4], flow: true, path: [[1210, 250], [1100, 420], [980, 620], [880, 830]] },
      { char: '全', std: ['㇏'], name: '人 파임', rules: [4], path: [[1230, 260], [1400, 420], [1580, 560], [1740, 680]] },
      { char: '全', std: ['一', '一', '丨'], name: '王 가로·가로·세로 (연필)', rules: [3, 1], path: [[1200, 600], [1380, 660], [1300, 800], [1180, 850]] },
      { char: '全', std: ['一'], name: '王 아래 가로 (마지막)', rules: [1], path: [[1270, 1030], [1600, 1010], [1960, 990]] },
    ],
  },
];
