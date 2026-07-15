import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Screen = 'home' | 'presets' | 'join' | 'scan' | 'room' | 'record' | 'history' | 'settlement';
type Seat = '東' | '南' | '西' | '北';
type BaseType = '二五雞' | '五一' | '一二蚊';
type DiscardMode = '半銃' | '全銃';
type GrowthMode = '半辣上' | '辣辣上';
type WinType = '自摸' | '食糊' | '包自摸';
type RoundType = WinType | '流局';

type Player = { id: string; seat: Seat; name: string };
type TableSetting = { presetId: string; presetName: string; group: '細枱' | '中枱' | '大枱'; baseType: BaseType; discardMode: DiscardMode; growthMode: GrowthMode; capFaan: 8 | 10; capAmount: number };
type Room = { id: string; name: string; setting: TableSetting; players: Player[]; initialRoundWind: Seat; initialDealerSeat: Seat; createdAt: string };
type RoundDraft = { winnerId: string; winType: WinType; payerId: string; faan: number; note: string };
type RoundRecord = { id: string; roundNo: number; winnerId?: string; winnerSeat?: Seat; winType: RoundType; payerId?: string; faan: number; amountEach: number; payments: Record<string, number>; note: string; roundWind: Seat; dealerSeat: Seat; updatedAt: string };
type WindState = { roundWind: Seat; dealerSeat: Seat };

const PRESET_ROWS: Array<[TableSetting['group'], string, BaseType, DiscardMode, GrowthMode, 8 | 10, number]> = [
  ['細枱', '二五雞・半銃・半辣上・8番頂 $64', '二五雞', '半銃', '半辣上', 8, 64],
  ['細枱', '二五雞・半銃・半辣上・10番頂 $128', '二五雞', '半銃', '半辣上', 10, 128],
  ['細枱', '二五雞・全銃・半辣上・8番頂 $128', '二五雞', '全銃', '半辣上', 8, 128],
  ['細枱', '二五雞・全銃・辣辣上・8番頂 $256', '二五雞', '全銃', '辣辣上', 8, 256],
  ['中枱', '五一・半銃・半辣上・8番頂 $128', '五一', '半銃', '半辣上', 8, 128],
  ['中枱', '五一・半銃・半辣上・10番頂 $256', '五一', '半銃', '半辣上', 10, 256],
  ['中枱', '五一・全銃・半辣上・8番頂 $256', '五一', '全銃', '半辣上', 8, 256],
  ['中枱', '五一・全銃・辣辣上・8番頂 $512', '五一', '全銃', '辣辣上', 8, 512],
  ['大枱', '一二蚊・半銃・半辣上・8番頂 $256', '一二蚊', '半銃', '半辣上', 8, 256],
  ['大枱', '一二蚊・半銃・半辣上・10番頂 $512', '一二蚊', '半銃', '半辣上', 10, 512],
  ['大枱', '一二蚊・全銃・半辣上・8番頂 $512', '一二蚊', '全銃', '半辣上', 8, 512],
  ['大枱', '一二蚊・全銃・辣辣上・8番頂 $1024', '一二蚊', '全銃', '辣辣上', 8, 1024],
];

const PRESETS: TableSetting[] = PRESET_ROWS.map((item, index) => ({ presetId: `preset-${index}`, group: item[0], presetName: item[1], baseType: item[2], discardMode: item[3], growthMode: item[4], capFaan: item[5], capAmount: item[6] }));
const SEATS: Seat[] = ['東', '南', '西', '北'];
const FAAN_OPTIONS = Array.from({ length: 14 }, (_, index) => index);
const DEFINITIONS: Record<string, string> = {
  二五雞: '較細注碼嘅常見計法，適合休閒局。金額大約係五一嘅一半。',
  五一: '中等注碼嘅常見計法，金額大約係二五雞嘅兩倍。',
  一二蚊: '較大注碼嘅常見計法，金額大約係五一嘅兩倍。',
  半銃: '食糊時，出銃者俾較多，另外兩位輸家都要俾部分金額。',
  全銃: '食糊時，出銃者一個人包晒該鋪食糊金額，另外兩位唔使俾。',
  半辣上: '四番之後用較平滑嘅加幅上升，金額升得冇辣辣上咁急。',
  辣辣上: '四番之後繼續每高一番就倍升，金額升得快。',
  封頂: '計到封頂番數或以上，都只會用封頂金額計。',
  包自摸: '有人需要包晒自摸金額時使用。贏家照收自摸總額，包自摸者一個人俾晒。',
};

const money = (amount: number) => `${amount < 0 ? '-' : ''}$${Math.abs(amount).toLocaleString('zh-HK')}`;
const nameOf = (player?: Player) => (player?.name.trim() ? player.name.trim() : '未坐低');
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function amountForFaan(setting: TableSetting, faan: number) {
  const capped = Math.min(faan, setting.capFaan);
  const halfUnit = (value: number) => (value <= 4 ? 2 ** value : value % 2 === 1 ? 24 * 2 ** ((value - 5) / 2) : 2 ** (2 + value / 2));
  const unit = setting.growthMode === '半辣上' ? halfUnit(capped) : 2 ** capped;
  const capUnit = setting.growthMode === '半辣上' ? halfUnit(setting.capFaan) : 2 ** setting.capFaan;
  return Math.round((setting.capAmount * unit * 100) / capUnit) / 100;
}

function calc(players: Player[], setting: TableSetting, draft: RoundDraft) {
  const amountEach = amountForFaan(setting, draft.faan);
  const payments = Object.fromEntries(players.map((player) => [player.id, 0]));
  const losers = players.filter((player) => player.id !== draft.winnerId).map((player) => player.id);
  if (draft.winType === '自摸') losers.forEach((id) => { payments[id] -= amountEach; payments[draft.winnerId] += amountEach; });
  if (draft.winType === '食糊') {
    if (setting.discardMode === '全銃') {
      payments[draft.payerId] -= amountEach * 3;
      payments[draft.winnerId] += amountEach * 3;
    } else {
      losers.forEach((id) => { const pay = id === draft.payerId ? amountEach * 2 : amountEach; payments[id] -= pay; payments[draft.winnerId] += pay; });
    }
  }
  if (draft.winType === '包自摸') {
    payments[draft.payerId] -= amountEach * 3;
    payments[draft.winnerId] += amountEach * 3;
  }
  return { amountEach, payments };
}

function totals(players: Player[], rounds: RoundRecord[]) {
  const result = Object.fromEntries(players.map((player) => [player.id, 0]));
  rounds.forEach((round) => players.forEach((player) => { result[player.id] += round.payments[player.id] ?? 0; }));
  return result;
}

function settlement(players: Player[], total: Record<string, number>) {
  const debtors = players.map((player) => ({ player, amount: total[player.id] })).filter((item) => item.amount < 0).sort((a, b) => a.amount - b.amount);
  const creditors = players.map((player) => ({ player, amount: total[player.id] })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const lines: { from: Player; to: Player; amount: number }[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(Math.abs(debtors[debtorIndex].amount), creditors[creditorIndex].amount);
    lines.push({ from: debtors[debtorIndex].player, to: creditors[creditorIndex].player, amount });
    debtors[debtorIndex].amount += amount;
    creditors[creditorIndex].amount -= amount;
    if (Math.abs(debtors[debtorIndex].amount) < 0.01) debtorIndex += 1;
    if (creditors[creditorIndex].amount < 0.01) creditorIndex += 1;
  }
  return lines;
}

function nextWind(value: Seat) {
  return SEATS[(SEATS.indexOf(value) + 1) % SEATS.length];
}

function advanceWind(state: WindState): WindState {
  const dealerSeat = nextWind(state.dealerSeat);
  return { dealerSeat, roundWind: dealerSeat === '東' ? nextWind(state.roundWind) : state.roundWind };
}

function windInfo(room: Room | null, rounds: RoundRecord[]) {
  const states: Record<string, WindState> = {};
  let current: WindState = { roundWind: room?.initialRoundWind ?? '東', dealerSeat: room?.initialDealerSeat ?? '東' };
  rounds.slice().sort((a, b) => a.roundNo - b.roundNo).forEach((round) => {
    states[round.id] = { ...current };
    const winner = room?.players.find((player) => player.id === round.winnerId);
    const winnerSeat = round.winnerSeat ?? winner?.seat;
    if (round.winType !== '流局' && winnerSeat !== current.dealerSeat) current = advanceWind(current);
  });
  return { states, current };
}

function parseRoomCode(value: string) {
  return (value.trim().match(/room\/([a-z0-9]{6})/i)?.[1] ?? value.trim().match(/^[a-z0-9]{6}$/i)?.[0] ?? '').toUpperCase();
}

export default function App() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [screen, setScreen] = useState<Screen>('home');
  const [userName, setUserName] = useState('我');
  const [roomName, setRoomName] = useState('今晚麻雀局');
  const [room, setRoom] = useState<Room | null>(null);
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [draft, setDraft] = useState<RoundDraft>({ winnerId: 'player-1', winType: '自摸', payerId: 'player-2', faan: 3, note: '' });
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [definitionKey, setDefinitionKey] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [scanned, setScanned] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [noteRoundId, setNoteRoundId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapA, setSwapA] = useState('');
  const [swapB, setSwapB] = useState('');

  const total = room ? totals(room.players, rounds) : {};
  const currentWind = windInfo(room, rounds).current;
  const preview = room ? calc(room.players, room.setting, draft) : null;
  const roomLink = room ? `mahjong-score-room://room/${room.id}` : '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(roomLink)}`;
  const playerBySeat = (seat: Seat) => room?.players.find((player) => player.seat === seat);
  const allNamed = () => Boolean(room?.players.every((player) => player.name.trim()));
  const nextRoundNo = () => Math.max(0, ...rounds.map((round) => round.roundNo)) + 1;

  const createRoom = (setting: TableSetting) => {
    const players = SEATS.map((seat, index) => ({ id: `player-${index + 1}`, seat, name: index === 0 ? userName.trim() || '我' : '' }));
    setRoom({ id: Math.random().toString(36).slice(2, 8).toUpperCase(), name: roomName.trim() || '今晚麻雀局', setting, players, initialRoundWind: '東', initialDealerSeat: '東', createdAt: new Date().toISOString() });
    setRounds([]);
    setInviteOpen(false);
    setDraft({ winnerId: players[0].id, winType: '自摸', payerId: players[1].id, faan: 3, note: '' });
    setScreen('room');
  };

  const updatePlayer = (id: string, name: string) => setRoom((current) => current ? { ...current, players: current.players.map((player) => player.id === id ? { ...player, name } : player) } : current);

  const startRound = (winnerId: string) => {
    if (!room) return;
    if (!allNamed()) { Alert.alert('未坐齊', '要四位都輸入名先可以記一鋪。'); return; }
    setEditingRoundId(null);
    setDraft({ winnerId, winType: '自摸', payerId: room.players.find((player) => player.id !== winnerId)?.id ?? '', faan: 3, note: '' });
    setScreen('record');
  };

  const saveRound = () => {
    if (!room) return;
    if ((draft.winType === '食糊' || draft.winType === '包自摸') && draft.payerId === draft.winnerId) { Alert.alert('未揀齊資料', '出銃者或包自摸者唔可以同贏家一樣。'); return; }
    const result = calc(room.players, room.setting, draft);
    const winner = room.players.find((player) => player.id === draft.winnerId);
    const updatedAt = new Date().toLocaleString('zh-HK');
    if (editingRoundId) {
      setRounds((items) => items.map((round) => round.id === editingRoundId ? { ...round, ...draft, winnerSeat: winner?.seat, amountEach: result.amountEach, payments: result.payments, note: draft.note, updatedAt } : round));
    } else {
      setRounds((items) => [{ id: makeId(), roundNo: nextRoundNo(), ...draft, winnerSeat: winner?.seat, amountEach: result.amountEach, payments: result.payments, note: draft.note, roundWind: currentWind.roundWind, dealerSeat: currentWind.dealerSeat, updatedAt }, ...items]);
    }
    setEditingRoundId(null);
    setScreen('room');
  };

  const saveDraw = () => {
    if (!room) return;
    if (!allNamed()) { Alert.alert('未坐齊', '要四位都輸入名先可以記流局。'); return; }
    setRounds((items) => [{ id: makeId(), roundNo: nextRoundNo(), winType: '流局', faan: 0, amountEach: 0, payments: Object.fromEntries(room.players.map((player) => [player.id, 0])), note: '', roundWind: currentWind.roundWind, dealerSeat: currentWind.dealerSeat, updatedAt: new Date().toLocaleString('zh-HK') }, ...items]);
    Alert.alert('流局', '已經 mark 左依局流局。');
  };

  const editRound = (round: RoundRecord) => {
    if (!room || !round.winnerId || round.winType === '流局') return;
    setEditingRoundId(round.id);
    setDraft({ winnerId: round.winnerId, winType: round.winType, payerId: round.payerId ?? room.players.find((player) => player.id !== round.winnerId)?.id ?? '', faan: round.faan, note: round.note });
    setScreen('record');
  };

  const undoLast = () => {
    if (!rounds.length) { Alert.alert('還原上一鋪', '未有牌局紀錄可以還原。'); return; }
    Alert.alert('還原上一鋪？', `確定要還原第 ${rounds[0].roundNo} 鋪？`, [{ text: '取消', style: 'cancel' }, { text: '還原', style: 'destructive', onPress: () => setRounds((items) => items.slice(1)) }]);
  };

  const deleteRound = (round: RoundRecord) => Alert.alert(round.winType === '流局' ? '刪除流局？' : '刪除紀錄？', '刪除後會重新計算莊家同風圈。', [{ text: '取消', style: 'cancel' }, { text: round.winType === '流局' ? '刪除流局' : '刪除', style: 'destructive', onPress: () => setRounds((items) => items.filter((item) => item.id !== round.id)) }]);

  const openNote = (round: RoundRecord) => { setNoteRoundId(round.id); setNoteText(round.note); };
  const saveNote = () => { setRounds((items) => items.map((round) => round.id === noteRoundId ? { ...round, note: noteText.trim(), updatedAt: new Date().toLocaleString('zh-HK') } : round)); setNoteRoundId(null); setNoteText(''); };

  const openSwap = () => { if (!room) return; setSwapA(room.players[0].id); setSwapB(room.players[1].id); setSwapOpen(true); };
  const applySwap = () => {
    if (!room || swapA === swapB) { Alert.alert('調位', '請揀兩個唔同座位。'); return; }
    const first = room.players.find((player) => player.id === swapA);
    const second = room.players.find((player) => player.id === swapB);
    if (!first || !second) return;
    setRoom({ ...room, players: room.players.map((player) => player.id === swapA ? { ...player, seat: second.seat } : player.id === swapB ? { ...player, seat: first.seat } : player) });
    setSwapOpen(false);
  };

  const joinRoom = () => {
    const code = parseRoomCode(joinCode);
    if (room && code === room.id) { setScreen('room'); return; }
    Alert.alert('搵唔到房', '呢個手機試用版暫時只可以加入本機已開嘅示範房。');
  };

  const handleScan = ({ data }: BarcodeScanningResult) => {
    const code = parseRoomCode(data);
    setScanned(true);
    if (!code) { Alert.alert('掃唔到房號', '呢個 QR Code 唔似係雀數房房號。', [{ text: '再掃一次', onPress: () => setScanned(false) }]); return; }
    setJoinCode(code);
    if (room && code === room.id) setScreen('room');
    else Alert.alert('已掃到房號', `房號：${code}`, [{ text: '再掃一次', onPress: () => setScanned(false) }, { text: '用房號入房', onPress: () => setScreen('join') }]);
  };

  const settlementText = () => {
    if (!room) return '';
    const lines = settlement(room.players, total).map((item) => `${nameOf(item.from)} 俾 ${nameOf(item.to)} ${money(item.amount)}`);
    return [`${room.name} 結算`, `枱規：${room.setting.presetName}`, `風圈：${currentWind.roundWind}圈・${currentWind.dealerSeat}局`, `總數：${room.players.map((player) => `${player.seat} ${nameOf(player)} ${total[player.id] >= 0 ? '+' : ''}${money(total[player.id] ?? 0)}`).join('，')}`, lines.length ? `找數：${lines.join('；')}` : '找數：暫時唔使找數。'].join('\n');
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        {screen === 'home' && <ScrollView contentContainerStyle={styles.homePage}><View style={styles.homeHero}><View style={styles.tile}><Text style={styles.tileText}>中</Text></View><Text style={styles.eyebrow}>港式麻雀計數</Text><Text style={styles.title}>雀數</Text><Text style={styles.subtitle}>開房、掃碼、記牌、流局、調位、埋數。</Text></View><View style={styles.panel}><Text style={styles.panelTitle}>今日點叫你？</Text><TextInput value={userName} onChangeText={setUserName} placeholder="你個名" style={styles.input} /><Pressable style={styles.primaryButton} onPress={() => setScreen('presets')}><Text style={styles.primaryButtonText}>開新房</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => setScreen('join')}><Text style={styles.secondaryButtonText}>輸入房號入房 / Scan QR Code</Text></Pressable>{room && <Pressable style={styles.secondaryButton} onPress={() => setScreen('room')}><Text style={styles.secondaryButtonText}>返去上次間房</Text></Pressable>}</View></ScrollView>}

        {screen === 'presets' && <ScrollView contentContainerStyle={styles.page}><Header title="揀枱規" onBack={() => setScreen('home')} /><View style={styles.panel}><Text style={styles.label}>房名</Text><TextInput value={roomName} onChangeText={setRoomName} placeholder="今晚麻雀局" style={styles.input} /><Pressable style={styles.helpButton} onPress={() => setDefinitionKey('枱規總覽')}><Text style={styles.helpButtonText}>枱規解釋</Text></Pressable></View>{(['細枱', '中枱', '大枱'] as TableSetting['group'][]).map((group) => <View key={group} style={styles.section}><Text style={styles.sectionTitle}>{group}</Text>{PRESETS.filter((preset) => preset.group === group).map((preset) => <View key={preset.presetId} style={styles.card}><Text style={styles.cardTitle}>{preset.presetName}</Text><Text style={styles.muted}>{preset.capFaan}番頂，每位封頂 {money(preset.capAmount)}</Text><View style={styles.actionsRow}><Pressable style={styles.secondaryButtonCompact} onPress={() => setDefinitionKey(preset.presetId)}><Text style={styles.secondaryButtonText}>咩嚟？</Text></Pressable><Pressable style={styles.primaryButtonCompact} onPress={() => createRoom(preset)}><Text style={styles.primaryButtonText}>揀呢個開房</Text></Pressable></View></View>)}</View>)}</ScrollView>}

        {screen === 'join' && <ScrollView contentContainerStyle={styles.page}><Header title="入房" onBack={() => setScreen('home')} /><View style={styles.panel}><Text style={styles.label}>房號</Text><TextInput value={joinCode} onChangeText={setJoinCode} placeholder="輸入房號" autoCapitalize="characters" style={styles.input} /><Pressable style={styles.primaryButton} onPress={joinRoom}><Text style={styles.primaryButtonText}>入房</Text></Pressable><Pressable style={styles.secondaryButton} onPress={() => { setScanned(false); setScreen('scan'); }}><Text style={styles.secondaryButtonText}>Scan QR Code</Text></Pressable></View></ScrollView>}

        {screen === 'scan' && <View style={styles.scanPage}><Header title="掃碼入房" onBack={() => setScreen('home')} />{!cameraPermission?.granted ? <View style={styles.panel}><Text style={styles.panelTitle}>需要相機權限</Text><Text style={styles.muted}>開相機先可以掃房主個 QR Code。</Text><Pressable style={styles.primaryButton} onPress={requestCameraPermission}><Text style={styles.primaryButtonText}>開相機權限</Text></Pressable></View> : <View style={styles.cameraWrap}><CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned ? undefined : handleScan} /><View style={styles.scanOverlay}><Text style={styles.scanText}>對準房主個 QR Code</Text></View></View>}</View>}

        {screen === 'room' && room && <ScrollView contentContainerStyle={styles.page}><Header title={room.name} onBack={() => setScreen('home')} /><View style={styles.roomTop}><View style={styles.flex}><Text style={styles.muted}>房間邀請</Text><Text style={styles.cardTitle}>{inviteOpen ? '房號同 QR Code' : '房號同 QR Code 已收起'}</Text><Text style={styles.muted}>{room.setting.presetName}</Text>{inviteOpen && <Text style={styles.roomCode}>{room.id}</Text>}</View><Pressable style={styles.secondaryButtonCompact} onPress={() => setInviteOpen((value) => !value)}><Text style={styles.secondaryButtonText}>{inviteOpen ? '收起' : '顯示房號 / QR'}</Text></Pressable></View>{inviteOpen && <Image source={{ uri: qrUrl }} style={styles.qr} />}<View style={styles.actionsWrap}><Pressable style={styles.secondaryButtonCompact} onPress={undoLast}><Text style={styles.secondaryButtonText}>還原上一鋪</Text></Pressable><Pressable style={styles.secondaryButtonCompact} onPress={saveDraw}><Text style={styles.secondaryButtonText}>流局</Text></Pressable><Pressable style={styles.secondaryButtonCompact} onPress={openSwap}><Text style={styles.secondaryButtonText}>調位</Text></Pressable><Pressable style={styles.secondaryButtonCompact} onPress={() => setScreen('history')}><Text style={styles.secondaryButtonText}>牌局紀錄</Text></Pressable><Pressable style={styles.secondaryButtonCompact} onPress={() => setScreen('settlement')}><Text style={styles.secondaryButtonText}>結算</Text></Pressable></View><View style={styles.table}>{playerBySeat('北') && <View style={styles.topSeat}><SeatCard player={playerBySeat('北')!} total={total[playerBySeat('北')!.id] ?? 0} isDealer={currentWind.dealerSeat === '北'} onNameChange={updatePlayer} onWin={startRound} /></View>}<View style={styles.middleRow}>{playerBySeat('西') && <View style={styles.sideSeat}><SeatCard player={playerBySeat('西')!} total={total[playerBySeat('西')!.id] ?? 0} isDealer={currentWind.dealerSeat === '西'} onNameChange={updatePlayer} onWin={startRound} /></View>}<View style={styles.tableCenter}><Text style={styles.tableTitle}>麻雀枱</Text><Text style={styles.tableWind}>{currentWind.roundWind}圈・{currentWind.dealerSeat}局</Text></View>{playerBySeat('東') && <View style={styles.sideSeat}><SeatCard player={playerBySeat('東')!} total={total[playerBySeat('東')!.id] ?? 0} isDealer={currentWind.dealerSeat === '東'} onNameChange={updatePlayer} onWin={startRound} /></View>}</View>{playerBySeat('南') && <View style={styles.topSeat}><SeatCard player={playerBySeat('南')!} total={total[playerBySeat('南')!.id] ?? 0} isDealer={currentWind.dealerSeat === '南'} onNameChange={updatePlayer} onWin={startRound} /></View>}</View></ScrollView>}

        {screen === 'record' && room && preview && <ScrollView contentContainerStyle={styles.page}><Header title={editingRoundId ? '改紀錄' : '記一鋪'} onBack={() => setScreen('room')} /><PickerBlock title="邊個贏？" players={room.players} selectedId={draft.winnerId} onSelect={(winnerId) => setDraft({ ...draft, winnerId, payerId: room.players.find((player) => player.id !== winnerId)?.id ?? draft.payerId })} /><View style={styles.section}><Text style={styles.sectionTitle}>食糊方式</Text><View style={styles.chips}>{(['自摸', '食糊', '包自摸'] as WinType[]).map((type) => <Chip key={type} label={type} selected={draft.winType === type} onPress={() => setDraft({ ...draft, winType: type })} />)}<Pressable style={styles.inlineHelp} onPress={() => setDefinitionKey('包自摸')}><Text style={styles.inlineHelpText}>包自摸係咩？</Text></Pressable></View></View>{draft.winType !== '自摸' && <PickerBlock title={draft.winType === '食糊' ? '邊個出銃？' : '邊個包自摸？'} players={room.players.filter((player) => player.id !== draft.winnerId)} selectedId={draft.payerId} onSelect={(payerId) => setDraft({ ...draft, payerId })} />}<View style={styles.section}><Text style={styles.sectionTitle}>幾多番？</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faanRow}>{FAAN_OPTIONS.map((faan) => <Chip key={faan} label={`${faan}番`} selected={draft.faan === faan} onPress={() => setDraft({ ...draft, faan })} />)}</ScrollView></View><View style={styles.panel}><Text style={styles.label}>備註</Text><TextInput value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} placeholder="例如 十三么、包自摸、大三元" multiline style={[styles.input, styles.textArea]} /></View><View style={styles.panel}><Text style={styles.panelTitle}>即時計算</Text><Text style={styles.muted}>每位自摸金額：{money(preview.amountEach)}</Text>{room.players.map((player) => <View key={player.id} style={styles.previewRow}><Text style={styles.previewName}>{player.seat} {nameOf(player)}</Text><Text style={[styles.value, preview.payments[player.id] >= 0 ? styles.positive : styles.negative]}>{money(preview.payments[player.id])}</Text></View>)}</View><Pressable style={styles.primaryButton} onPress={saveRound}><Text style={styles.primaryButtonText}>{editingRoundId ? '儲存修改' : '確認記錄'}</Text></Pressable></ScrollView>}

        {screen === 'history' && room && <ScrollView contentContainerStyle={styles.page}><Header title="牌局紀錄" onBack={() => setScreen('room')} />{rounds.length === 0 ? <Empty text="未有紀錄，打完第一鋪就可以喺度睇返。" /> : rounds.map((round) => { const winner = room.players.find((player) => player.id === round.winnerId); const payer = room.players.find((player) => player.id === round.payerId); const state = windInfo(room, rounds).states[round.id] ?? round; const isDraw = round.winType === '流局'; return <View key={round.id} style={styles.card}><Text style={styles.cardTitle}>第 {round.roundNo} 鋪：{isDraw ? '流局' : `${nameOf(winner)} ${round.winType} ${round.faan}番`}</Text><Text style={styles.muted}>{state.roundWind}圈・{state.dealerSeat}局{payer && !isDraw && round.winType !== '自摸' ? ` · ${round.winType === '食糊' ? '出銃' : '包自摸'}：${nameOf(payer)}` : ''}</Text><Text style={styles.muted}>最後修改：{round.updatedAt}</Text>{round.note ? <Text style={styles.note}>{round.note}</Text> : null}<View style={styles.pillGrid}>{room.players.map((player) => <Text key={player.id} style={[styles.pill, round.payments[player.id] >= 0 ? styles.goodPill : styles.badPill]}>{nameOf(player)} {money(round.payments[player.id])}</Text>)}</View><View style={styles.actionsRow}>{isDraw ? <Pressable style={styles.secondaryButtonCompact} onPress={() => { setNoteRoundId(round.id); setNoteText(round.note); }}><Text style={styles.secondaryButtonText}>修改備註</Text></Pressable> : <Pressable style={styles.secondaryButtonCompact} onPress={() => editRound(round)}><Text style={styles.secondaryButtonText}>修改</Text></Pressable>}<Pressable style={styles.dangerButton} onPress={() => deleteRound(round)}><Text style={styles.dangerButtonText}>{isDraw ? '刪除流局' : '刪除'}</Text></Pressable></View></View>; })}</ScrollView>}

        {screen === 'settlement' && room && <ScrollView contentContainerStyle={styles.page}><Header title="結算" onBack={() => setScreen('room')} rightLabel="分享" onRightPress={() => Share.share({ message: settlementText() })} /><View style={styles.section}><Text style={styles.sectionTitle}>總數</Text>{room.players.map((player) => <View key={player.id} style={styles.playerRow}><Text style={styles.seatBadge}>{player.seat}</Text><Text style={styles.previewName}>{nameOf(player)}</Text><Text style={[styles.value, total[player.id] >= 0 ? styles.positive : styles.negative]}>{money(total[player.id] ?? 0)}</Text></View>)}</View><View style={styles.panel}><Text style={styles.panelTitle}>最少交易</Text>{settlement(room.players, total).length === 0 ? <Text style={styles.muted}>暫時唔使找數。</Text> : settlement(room.players, total).map((line, index) => <Text key={`${line.from.id}-${line.to.id}-${index}`} style={styles.settlementLine}>{nameOf(line.from)} 俾 {nameOf(line.to)} {money(line.amount)}</Text>)}</View></ScrollView>}

        <DefinitionModal keyName={definitionKey} setting={room?.setting ?? PRESETS[0]} onClose={() => setDefinitionKey(null)} />
        <NoteModal visible={Boolean(noteRoundId)} note={noteText} onChange={setNoteText} onClose={() => setNoteRoundId(null)} onSave={saveNote} />
        <SwapModal visible={swapOpen} players={room?.players ?? []} first={swapA} second={swapB} onFirst={setSwapA} onSecond={setSwapB} onClose={() => setSwapOpen(false)} onSave={applySwap} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title, onBack, rightLabel, onRightPress }: { title: string; onBack: () => void; rightLabel?: string; onRightPress?: () => void }) {
  return <View style={styles.header}><Pressable style={styles.headerButton} onPress={onBack}><Text style={styles.backText}>返回</Text></Pressable><Text style={styles.headerTitle}>{title}</Text>{rightLabel && onRightPress ? <Pressable style={styles.headerButton} onPress={onRightPress}><Text style={styles.backText}>{rightLabel}</Text></Pressable> : <View style={styles.headerSpacer} />}</View>;
}

function SeatCard({ player, total, isDealer, onNameChange, onWin }: { player: Player; total: number; isDealer: boolean; onNameChange: (id: string, name: string) => void; onWin: (id: string) => void }) {
  return <View style={[styles.seatCard, isDealer && styles.dealerCard]}><View style={styles.seatHead}><View style={styles.seatLabels}><Text style={styles.seatBadge}>{player.seat}</Text>{isDealer && <Text style={styles.dealerBadge}>莊</Text>}</View><Text style={[styles.seatTotal, total >= 0 ? styles.positive : styles.negative]}>{money(total)}</Text></View><TextInput value={player.name} onChangeText={(name) => onNameChange(player.id, name)} placeholder="輸入名" style={styles.seatInput} /><Pressable style={styles.winButton} onPress={() => onWin(player.id)}><Text style={styles.winText}>記 Win</Text></Pressable></View>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable style={[styles.chip, selected && styles.chipActive]} onPress={onPress}><Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text></Pressable>;
}

function PickerBlock({ title, players, selectedId, onSelect }: { title: string; players: Player[]; selectedId: string; onSelect: (id: string) => void }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.chips}>{players.map((player) => <Chip key={player.id} label={`${player.seat} ${nameOf(player)}`} selected={selectedId === player.id} onPress={() => onSelect(player.id)} />)}</View></View>;
}

function DefinitionModal({ keyName, setting, onClose }: { keyName: string | null; setting: TableSetting; onClose: () => void }) {
  const preset = PRESETS.find((item) => item.presetId === keyName);
  const isOverview = keyName === '枱規總覽';
  const keys = isOverview ? ['二五雞', '五一', '一二蚊', '半銃', '全銃', '半辣上', '辣辣上', '封頂', '包自摸'] : [preset?.baseType ?? setting.baseType, preset?.discardMode ?? setting.discardMode, preset?.growthMode ?? setting.growthMode, '封頂'];
  return <Modal visible={Boolean(keyName)} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.modalTitle}>{isOverview ? '枱規解釋' : preset?.presetName ?? keyName}</Text><ScrollView>{keys.map((key) => <View key={key} style={styles.definitionBlock}><Text style={styles.definitionTitle}>{key}</Text><Text style={styles.definitionText}>{DEFINITIONS[key]}</Text></View>)}</ScrollView><Pressable style={styles.primaryButton} onPress={onClose}><Text style={styles.primaryButtonText}>明白</Text></Pressable></View></View></Modal>;
}

function NoteModal({ visible, note, onChange, onClose, onSave }: { visible: boolean; note: string; onChange: (value: string) => void; onClose: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.modalTitle}>修改備註</Text><TextInput value={note} onChangeText={onChange} placeholder="例如 打錯牌重開" multiline style={[styles.input, styles.textArea]} /><View style={styles.actionsRow}><Pressable style={styles.secondaryButtonCompact} onPress={onClose}><Text style={styles.secondaryButtonText}>取消</Text></Pressable><Pressable style={styles.primaryButtonCompact} onPress={onSave}><Text style={styles.primaryButtonText}>儲存備註</Text></Pressable></View></View></View></Modal>;
}

function SwapModal({ visible, players, first, second, onFirst, onSecond, onClose, onSave }: { visible: boolean; players: Player[]; first: string; second: string; onFirst: (value: string) => void; onSecond: (value: string) => void; onClose: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalShade}><View style={styles.modalCard}><Text style={styles.modalTitle}>調位</Text><PickerBlock title="第一個座位" players={players} selectedId={first} onSelect={onFirst} /><PickerBlock title="第二個座位" players={players} selectedId={second} onSelect={onSecond} /><View style={styles.actionsRow}><Pressable style={styles.secondaryButtonCompact} onPress={onClose}><Text style={styles.secondaryButtonText}>取消</Text></Pressable><Pressable style={styles.primaryButtonCompact} onPress={onSave}><Text style={styles.primaryButtonText}>交換</Text></Pressable></View></View></View></Modal>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.muted}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f5f0e7' },
  flex: { flex: 1 },
  homePage: { padding: 18, paddingBottom: 40, gap: 18 },
  page: { padding: 18, paddingBottom: 42, gap: 16 },
  scanPage: { flex: 1, padding: 18, gap: 16 },
  homeHero: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 8 },
  tile: { width: 74, height: 74, borderRadius: 18, backgroundColor: '#fffaf0', borderWidth: 1, borderColor: '#e2d2b9', alignItems: 'center', justifyContent: 'center' },
  tileText: { color: '#d1442f', fontSize: 38, fontWeight: '900' },
  eyebrow: { color: '#143d38', fontSize: 14, fontWeight: '900' },
  title: { color: '#143d38', fontSize: 52, fontWeight: '900', letterSpacing: 0 },
  subtitle: { color: '#746b5e', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  panel: { backgroundColor: '#fffaf0', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2d2b9', gap: 12 },
  panelTitle: { color: '#30302c', fontSize: 17, fontWeight: '900' },
  muted: { color: '#746b5e', fontSize: 14, lineHeight: 20 },
  label: { color: '#30302c', fontSize: 14, fontWeight: '900' },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: '#d7c3a6', backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 16, color: '#30302c' },
  textArea: { minHeight: 96, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  primaryButton: { minHeight: 52, borderRadius: 12, backgroundColor: '#d1442f', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonCompact: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: '#d1442f', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryButtonText: { color: '#fffaf0', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { minHeight: 52, borderRadius: 12, backgroundColor: '#ecdfc8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButtonCompact: { flexGrow: 1, minHeight: 46, borderRadius: 12, backgroundColor: '#ecdfc8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { color: '#143d38', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  dangerButton: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: '#f3d6d0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  dangerButtonText: { color: '#a12f20', fontSize: 15, fontWeight: '900' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  headerButton: { minWidth: 56, paddingVertical: 8, paddingRight: 8 },
  backText: { color: '#d1442f', fontWeight: '900', fontSize: 15 },
  headerTitle: { color: '#143d38', fontSize: 22, fontWeight: '900' },
  headerSpacer: { width: 56 },
  helpButton: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#143d38', paddingHorizontal: 14, paddingVertical: 8 },
  helpButtonText: { color: '#fffaf0', fontWeight: '900' },
  section: { gap: 10 },
  sectionTitle: { color: '#143d38', fontSize: 20, fontWeight: '900' },
  card: { backgroundColor: '#fffaf0', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2d2b9', gap: 12 },
  cardTitle: { color: '#30302c', fontSize: 16, fontWeight: '900', lineHeight: 22 },
  roomTop: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fffaf0', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2d2b9' },
  roomCode: { color: '#d1442f', fontSize: 34, fontWeight: '900', letterSpacing: 0, marginTop: 8 },
  qr: { width: 220, height: 220, alignSelf: 'center', borderRadius: 12, backgroundColor: '#fff' },
  cameraWrap: { flex: 1, overflow: 'hidden', borderRadius: 18, backgroundColor: '#143d38' },
  camera: { flex: 1 },
  scanOverlay: { position: 'absolute', left: 18, right: 18, bottom: 18, minHeight: 56, borderRadius: 14, backgroundColor: 'rgba(20, 61, 56, 0.86)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  scanText: { color: '#fffaf0', fontSize: 16, fontWeight: '900' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  table: { gap: 10, alignItems: 'center', marginTop: 4 },
  topSeat: { width: '58%' },
  sideSeat: { width: '31%' },
  middleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tableCenter: { flex: 1, minHeight: 158, borderRadius: 22, borderWidth: 2, borderColor: '#d6c09e', backgroundColor: '#fffaf0', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tableTitle: { color: '#143d38', fontSize: 18, fontWeight: '900' },
  tableWind: { borderRadius: 999, backgroundColor: '#f8d675', color: '#30302c', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, fontWeight: '900' },
  seatCard: { minHeight: 154, borderRadius: 14, padding: 10, backgroundColor: '#fffaf0', borderWidth: 1, borderColor: '#e2d2b9', gap: 8 },
  dealerCard: { borderColor: '#d5a93f', shadowColor: '#be851a', shadowOpacity: 0.18, shadowRadius: 10, elevation: 2 },
  seatHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  seatLabels: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seatBadge: { minWidth: 36, height: 36, borderRadius: 18, backgroundColor: '#143d38', color: '#fffaf0', textAlign: 'center', textAlignVertical: 'center', lineHeight: 36, fontSize: 17, fontWeight: '900', overflow: 'hidden' },
  dealerBadge: { borderRadius: 999, backgroundColor: '#f8d675', color: '#30302c', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '900' },
  seatTotal: { fontSize: 15, fontWeight: '900' },
  seatInput: { minHeight: 42, borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 10, color: '#30302c', fontWeight: '800' },
  winButton: { minHeight: 36, borderRadius: 999, backgroundColor: '#ecdfc8', alignItems: 'center', justifyContent: 'center' },
  winText: { color: '#143d38', fontWeight: '900' },
  playerRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fffaf0', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#e2d2b9' },
  value: { minWidth: 82, textAlign: 'right', fontSize: 16, fontWeight: '900' },
  positive: { color: '#177a55' },
  negative: { color: '#b43726' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  faanRow: { gap: 8 },
  chip: { borderRadius: 999, backgroundColor: '#ecdfc8', paddingHorizontal: 14, paddingVertical: 10 },
  chipActive: { backgroundColor: '#143d38' },
  chipText: { color: '#30302c', fontWeight: '900' },
  chipTextActive: { color: '#fffaf0' },
  inlineHelp: { justifyContent: 'center', paddingHorizontal: 8 },
  inlineHelpText: { color: '#d1442f', fontWeight: '900' },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eadbc6', paddingTop: 10 },
  previewName: { flex: 1, color: '#30302c', fontSize: 16, fontWeight: '800' },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 999, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, fontWeight: '900' },
  goodPill: { backgroundColor: '#d9efe3', color: '#177a55' },
  badPill: { backgroundColor: '#f3d6d0', color: '#b43726' },
  note: { color: '#30302c', fontSize: 15, lineHeight: 22, fontWeight: '700' },
  settlementLine: { color: '#143d38', fontSize: 18, fontWeight: '900', lineHeight: 28 },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffaf0', borderRadius: 14, padding: 18 },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 23, 20, 0.42)' },
  modalCard: { maxHeight: '82%', backgroundColor: '#fffaf0', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 12 },
  modalTitle: { color: '#143d38', fontSize: 22, fontWeight: '900' },
  definitionBlock: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eadbc6', gap: 4 },
  definitionTitle: { color: '#d1442f', fontSize: 16, fontWeight: '900' },
  definitionText: { color: '#30302c', fontSize: 15, lineHeight: 23 },
});