// Replace `lines` with final copy, or set `artwork` to an uploaded image URL.
// Layout, palette, and motion remain independent of the artwork.
export const scenes = [
  { title: '여백의 미', english: 'The art of empty space', category: 'light', theme: 'white', layout: 'center', lines: ['마음이 머무는 곳에,', '당신의 이야기를 씁니다.'], note: '비워낸 공간에, 오롯이 당신의 마음을 담아.', mood: '순백 · 먹 · 고요', effect: 'ink', label: '여백에 마음을 담다' },
  { title: '밤에 쓰는 편지', english: 'A letter to the night', category: 'dark', theme: 'black', layout: 'center', lines: ['가장 깊은 밤에도', '당신은 빛나고 있습니다.'], note: '어둠이 깊어질수록, 더 또렷해지는 한 문장.', mood: '흑백 · 빛 · 깊이', effect: 'glow' },
  { title: '종이의 온도', english: 'The warmth of paper', category: 'texture', theme: 'kraft', layout: 'paper', lines: ['서툰 마음도 괜찮아,', '천천히 피어나면 되니까.'], note: '손끝에 닿는 질감처럼, 오래 남는 다정함.', mood: '크래프트 · 온기 · 손글씨', effect: 'tilt' },
  { title: '마음의 무늬', english: 'A pattern of moments', category: 'pattern', theme: 'pattern', layout: 'center', lines: ['작은 마음이 모여', '우리라는 무늬가 됩니다.'], note: '반복되는 일상 속, 반복되지 않는 우리.', mood: '반복 · 리듬 · 연결', effect: 'drift' },
  { title: '봄의 첫 문장', english: 'The first words of spring', category: 'light', theme: 'sage', layout: 'left', lines: ['당신이 오는 길마다', '조용히 봄이 피어납니다.'], note: '어느 날 문득, 마음에도 계절이 찾아왔다.', mood: '연두 · 봄 · 시작', effect: 'float' },
  { title: '먹이 번지는 시간', english: 'An ocean in a drop of ink', category: 'texture', theme: 'rice', layout: 'enso', lines: ['흐르는 시간 속에도', '지워지지 않는 마음 하나.'], note: '한 방울의 먹이, 하나의 풍경이 되기까지.', mood: '한지 · 수묵 · 흐름', effect: 'ink' },
  { title: '푸른 새벽', english: 'Before the world wakes', category: 'dark', theme: 'navy', layout: 'left', lines: ['아직 오지 않은 내일을', '오늘의 마음으로 안아줘.'], note: '세상이 깨어나기 전, 나에게 건네는 인사.', mood: '남색 · 새벽 · 희망', effect: 'glow' },
  { title: '분홍빛 안부', english: 'A little tenderness', category: 'light', theme: 'rose', layout: 'center', lines: ['잘 지내냐는 말 대신', '꽃 한 송이를 보냅니다.'], note: '말보다 먼저 도착한, 당신의 다정한 마음.', mood: '분홍 · 다정 · 안부', effect: 'float' },
  { title: '문장이 흐르는 숲', english: 'A forest made of words', category: 'pattern', theme: 'forest', layout: 'vertical', lines: ['오래 바라보면', '작은 것들도 숲이 됩니다.'], note: '문장 사이를 산책하며, 깊게 숨을 쉬다.', mood: '숲 · 세로쓰기 · 반복', effect: 'drift' },
  { title: '오래된 서랍', english: 'Memories in the drawer', category: 'texture', theme: 'parchment', layout: 'paper', lines: ['오래된 기억 한 장에', '그날의 햇살이 남아있다.'], note: '빛바랜 종이 위로, 다시 선명해지는 순간.', mood: '빈티지 · 기록 · 기억', effect: 'tilt' },
  { title: '붉은 여운', english: 'Something that stays', category: 'dark', theme: 'red', layout: 'center', lines: ['스쳐가는 순간에도', '오래 남는 마음이 있다.'], note: '짧은 만남이 남긴, 가장 선명한 잔상.', mood: '적색 · 감정 · 여운', effect: 'ink' },
  { title: '바람의 문장', english: 'Written by the wind', category: 'light', theme: 'sky', layout: 'diagonal', lines: ['어디로 가든 괜찮아,', '너의 계절이 기다리니까.'], note: '가볍게 떠나, 가장 나다운 곳에 닿기를.', mood: '하늘 · 바람 · 자유', effect: 'float' },
  { title: '쓰고, 또 쓰고', english: 'Again, and again', category: 'pattern', theme: 'mono-pattern', layout: 'cutout', lines: ['수없이 써 내려가도', '처음 같은 마음으로.'], note: '같은 문장도, 매번 새로운 마음이 된다.', mood: '타이포 · 흑백 · 밀도', effect: 'drift' },
  { title: '돌의 기억', english: 'The quiet strength of stone', category: 'texture', theme: 'stone', layout: 'left', lines: ['흔들리는 날이 있어도', '너의 뿌리는 자라고 있어.'], note: '말없이 그 자리를 지키는, 단단한 위로.', mood: '돌 · 질감 · 단단함', effect: 'ink' },
  { title: '달빛 아래', english: 'Under a quiet moon', category: 'dark', theme: 'moon', layout: 'moon', lines: ['말하지 않아도 알아,', '너의 하루는 빛났다는 걸.'], note: '하루의 끝에서, 달이 대신 전하는 말.', mood: '달 · 밤 · 위로', effect: 'glow' },
  { title: '아무것도 아닌 날', english: 'An ordinary kind of magic', category: 'light', theme: 'butter', layout: 'center', lines: ['아무것도 아닌 오늘이', '가장 좋은 기억이 되기를.'], note: '평범해서 더 소중한, 오늘이라는 선물.', mood: '버터 · 일상 · 미소', effect: 'float' },
  { title: '손끝의 풍경', english: 'A landscape in your hands', category: 'texture', theme: 'linen', layout: 'vertical', lines: ['너의 손끝에서 시작된', '작고 다정한 세상 하나.'], note: '만들어가는 마음마다, 고유한 결이 있다.', mood: '린넨 · 공예 · 손길', effect: 'tilt' },
  { title: '사랑이라는 말', english: 'In a thousand little ways', category: 'pattern', theme: 'love', layout: 'center', lines: ['사랑이라는 말 속에는', '너의 모든 계절이 있다.'], note: '같은 말 속에 담긴, 셀 수 없이 많은 마음.', mood: '코랄 · 사랑 · 리듬', effect: 'drift' },
  { title: '깊은 숨', english: 'A moment to breathe', category: 'dark', theme: 'deep-green', layout: 'enso', lines: ['잠시 멈추어도 괜찮아,', '너는 충분히 잘하고 있어.'], note: '빈틈이 생겨야, 새로운 숨이 들어온다.', mood: '초록 · 호흡 · 휴식', effect: 'glow' },
  { title: '다시, 여백', english: 'Every ending, a beginning', category: 'light', theme: 'final', layout: 'center', lines: ['비워둔 마음의 자리에', '새로운 이야기가 시작된다.'], note: '스무 개의 장면, 그리고 당신의 첫 문장.', mood: '순백 · 시작 · 가능성', effect: 'ink' },
];
