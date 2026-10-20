// ═══════════════════════════════════════════════════
//  admin.js ─ 自律動起來「管理員後台」
//  由 index.html 的載入器在「管理者」進入小天地時才讀取。
//  可用的外部項目（由載入器傳入）：
//    React, useState, useEffect, useRef, useMemo, firebase, db, Icon
//  注意：本檔需保留 AdminView 這個名稱，載入器會取用它。
// ═══════════════════════════════════════════════════

        const AdminView = () => {
            const [teams, setTeams] = useState([]);
            const [users, setUsers] = useState([]);
            const [loading, setLoading] = useState(true);
            const [movingUser, setMovingUser] = useState(null); // { uid, name }
            const [newTeamName, setNewTeamName] = useState('');
            const [creating, setCreating] = useState(false);
            const [tab, setTab] = useState('teams'); // 'teams' | 'users'
            const [editingName, setEditingName] = useState(null); // { uid, value }
            const [editingTeamName, setEditingTeamName] = useState(null); // { id, value }
            const [searchText, setSearchText] = useState('');
            // 稽核功能 state
            const [auditUser, setAuditUser] = useState(null);
            const [auditLogs, setAuditLogs] = useState([]);
            const [auditLoading, setAuditLoading] = useState(false);
            const [deletingDate, setDeletingDate] = useState(null);
            // Pizza state
            const [pizzaSliceCount, setPizzaSliceCount] = useState(1);
            const [pizzaReason, setPizzaReason] = useState('');
            const [pizzaSending, setPizzaSending] = useState(false);
            const [pizzaLogs, setPizzaLogs] = useState([]);
            const [pizzaLogsLoading, setPizzaLogsLoading] = useState(false);
            const [pizzaSendMode, setPizzaSendMode] = useState('team');
            const [pizzaSelectedTeamId, setPizzaSelectedTeamId] = useState(null);
            const [pizzaSelectedUids, setPizzaSelectedUids] = useState([]);

            useEffect(() => {
                const unsubTeams = db.collection('teams')
                    .onSnapshot(snap => {
                        const list = [];
                        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
                        setTeams(list);
                    });
                const unsubUsers = db.collection('users')
                    .onSnapshot(snap => {
                        const list = [];
                        snap.forEach(doc => list.push({ uid: doc.id, ...doc.data() }));
                        setUsers(list);
                        setLoading(false);
                    });
                return () => { unsubTeams(); unsubUsers(); };
            }, []);

            const deleteTeam = async (team) => {
                const membersInTeam = users.filter(u => u.teamId === team.id);
                if (!window.confirm(`確定刪除「${team.name}」陣營？\n${membersInTeam.length > 0 ? `⚠️ 裡面還有 ${membersInTeam.length} 位成員，他們將變成無陣營狀態。` : '此陣營目前沒有成員。'}`)) return;
                const batch = db.batch();
                membersInTeam.forEach(u => {
                    const ref = db.collection('users').doc(u.uid);
                    batch.update(ref, { teamId: firebase.firestore.FieldValue.delete(), teamName: firebase.firestore.FieldValue.delete() });
                });
                batch.delete(db.collection('teams').doc(team.id));
                await batch.commit();
            };

            const renameTeam = async (id, newName) => {
                if (!newName.trim()) return;
                const batch = db.batch();
                batch.update(db.collection('teams').doc(id), { name: newName.trim() });
                users.filter(u => u.teamId === id).forEach(u => {
                    batch.update(db.collection('users').doc(u.uid), { teamName: newName.trim() });
                });
                await batch.commit();
                setEditingTeamName(null);
            };

            const createTeam = async () => {
                const name = newTeamName.trim();
                if (!name) return;
                setCreating(true);
                await db.collection('teams').add({
                    name, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                setNewTeamName('');
                setCreating(false);
            };

            const moveUserToTeam = async (uid, teamId, teamName) => {
                await db.collection('users').doc(uid).update({ teamId, teamName });
                setMovingUser(null);
            };

            const removeUserFromTeam = async (uid) => {
                if (!window.confirm('確定將此成員移出陣營？')) return;
                await db.collection('users').doc(uid)
                    .update({ teamId: firebase.firestore.FieldValue.delete(), teamName: firebase.firestore.FieldValue.delete() });
            };

            const toggleActive = async (uid, currentActive) => {
                const next = currentActive === false ? true : false;
                const label = next ? '啟用' : '停用';
                if (!window.confirm(`確定要${label}此帳號？`)) return;
                await db.collection('users').doc(uid).update({ active: next });
            };

            const saveDisplayName = async (uid, newName) => {
                if (!newName.trim()) return;
                await db.collection('users').doc(uid).update({ displayName: newName.trim() });
                setEditingName(null);
            };

            // ── 打卡稽核：展開 / 收起某用戶的打卡明細 ──
            const openAudit = async (u) => {
                if (auditUser?.uid === u.uid) { setAuditUser(null); setAuditLogs([]); return; }
                setAuditUser({ uid: u.uid, name: u.displayName || u.email });
                setAuditLoading(true);
                setAuditLogs([]);
                try {
                    const snap = await db.collection('users').doc(u.uid)
                        .collection('dailyLogs').get();
                    const logs = [];
                    snap.forEach(doc => logs.push({ date: doc.id, ...doc.data() }));
                    logs.sort((a, b) => b.date.localeCompare(a.date));
                    setAuditLogs(logs);
                } catch(e) {
                    console.error('載入打卡紀錄失敗', e);
                }
                setAuditLoading(false);
            };

            // ── 打卡稽核：刪除某用戶某天的打卡紀錄 ──
            const deleteOneLog = async (uid, dateKey) => {
                if (!window.confirm(`確定刪除 ${dateKey} 的打卡紀錄？\n此操作無法復原，等級將自動重算。`)) return;
                setDeletingDate(dateKey);
                try {
                    await db.collection('users').doc(uid)
                        .collection('dailyLogs').doc(dateKey).delete();
                    setAuditLogs(prev => prev.filter(l => l.date !== dateKey));
                } catch(e) {
                    alert('刪除失敗：' + e.message);
                }
                setDeletingDate(null);
            };

            const teamColors = ['pk-yellow','pk-blue','pk-pink','pk-green','pk-purple','pk-orange'];
            
            // ── Team SVG Symbols ──
            const TeamSymbols = {
                0: ( // Yellow - Star
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                ),
                1: ( // Blue - Heart
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                ),
                2: ( // Pink - Flame
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                    </svg>
                ),
                3: ( // Green - Leaf
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                ),
                4: ( // Purple - Diamond
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l10 10-10 10L2 12l10-10z" />
                    </svg>
                ),
                5: ( // Orange - Flame (alt)
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.3 4 13c0 4.08 3.32 7.39 7.39 7.39s7.39-3.31 7.39-7.39C18.78 9.13 17.35 4.28 13.5.67zm2.34 16.6c-1.79-1.79-4.69-1.79-6.48 0-1.8 1.79-1.8 4.68 0 6.48 1.79 1.79 4.68 1.79 6.48 0 1.79-1.8 1.79-4.69 0-6.48z" />
                    </svg>
                ),
            };
            
            const getTeamSymbol = (teamIndex) => {
                return TeamSymbols[teamIndex % 6] || TeamSymbols[0];
            };

            return (
                <div className="space-y-4 animate-in fade-in duration-300">
                    {/* Header */}
                    <div className="p-5 r-card relative overflow-hidden" style={{background:'var(--c-text)'}}>
                        <div className="relative z-10">
                            <h2 className="sans-font text-xl text-white mb-0.5">管理員後台</h2>
                            <p className="text-xs sans-font" style={{color:'rgba(255,255,255,0.5)'}}>陣營與成員管理</p>
                        </div>
                        <Icon name="Shield" size={72} className="absolute -bottom-3 -right-2 rotate-12" style={{color:'rgba(255,255,255,0.08)'}} />
                    </div>

                    {/* Sub tabs */}
                    <div className="flex bg-white r-card" style={{border:'1px solid var(--c-border)', padding:'3px'}}>
                        <button onClick={() => setTab('teams')} className={`flex-1 sans-font text-xs r-btn transition-all ${tab === 'teams' ? 'pk-blue' : ''}`}
                            style={{color: tab === 'teams' ? 'var(--c-primary-text)' : 'var(--c-muted)', padding:'6px 0'}}>陣營管理</button>
                        <button onClick={() => setTab('users')} className={`flex-1 sans-font text-xs r-btn transition-all ${tab === 'users' ? 'pk-blue' : ''}`}
                            style={{color: tab === 'users' ? 'var(--c-primary-text)' : 'var(--c-muted)', padding:'6px 0'}}>成員管理</button>
                        <button onClick={() => { setTab('pizza'); setPizzaLogsLoading(true); db.collection('pizzaLogs').orderBy('createdAt','desc').limit(30).get().then(snap => { const logs = []; snap.forEach(d => logs.push({id:d.id,...d.data()})); setPizzaLogs(logs); setPizzaLogsLoading(false); }); }} className={`flex-1 sans-font text-xs r-btn transition-all ${tab === 'pizza' ? 'pk-yellow' : ''}`}
                            style={{color: tab === 'pizza' ? 'var(--c-accent-text)' : 'var(--c-muted)', padding:'6px 0'}}>🍕 Pizza</button>
                        <button onClick={() => { setTab('audit'); setAuditUser(null); setAuditLogs([]); }} className={`flex-1 sans-font text-xs r-btn transition-all ${tab === 'audit' ? 'pk-green' : ''}`}
                            style={{color: tab === 'audit' ? '#166534' : 'var(--c-muted)', padding:'6px 0'}}>打卡稽核</button>
                    </div>

                    {/* ── Teams tab ── */}
                    {tab === 'teams' && (
                        <div className="space-y-4">
                            {/* Create team */}
                            <div className="bg-white p-4 r-card card-shadow space-y-3">
                                <p className="sans-font text-xs tracking-widest" style={{color:'var(--c-muted)'}}>新增陣營</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text" value={newTeamName}
                                        onChange={e => setNewTeamName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && createTeam()}
                                        placeholder="陣營名稱..."
                                        className="flex-1 px-3 py-2 text-sm sans-font focus:outline-none bg-slate-50 r-btn"
                                        style={{border:'1px solid var(--c-border-strong)'}}
                                    />
                                    <button onClick={createTeam} disabled={creating || !newTeamName.trim()}
                                        className="pk-green px-4 py-2 r-btn neo-border-thin sans-font text-sm active-press disabled:opacity-30">
                                        {creating ? '...' : '新增'}
                                    </button>
                                </div>
                            </div>

                            {/* Team list */}
                            {teams.length === 0 && <p className="text-center text-xs sans-font py-4" style={{color:'var(--c-muted)'}}>尚無陣營</p>}
                            {teams.map((team, i) => {
                                const memberCount = users.filter(u => u.teamId === team.id).length;
                                const color = teamColors[i % teamColors.length];
                                return (
                                    <div key={team.id} className="bg-white p-4 r-card card-shadow">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className={`w-9 h-9 flex-shrink-0 ${color} neo-border-thin r-btn flex items-center justify-center`}
                                                    style={{color:'white', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                                    {getTeamSymbol(i)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    {editingTeamName?.id === team.id ? (
                                                        <div className="flex gap-1.5 items-center">
                                                            <input
                                                                autoFocus
                                                                className="flex-1 sans-font text-sm px-2 py-0.5 r-btn focus:outline-none min-w-0"
                                                                style={{border:'1.5px solid var(--c-primary)', color:'var(--c-text)'}}
                                                                value={editingTeamName.value}
                                                                onChange={e => setEditingTeamName(prev => ({...prev, value: e.target.value}))}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') renameTeam(team.id, editingTeamName.value);
                                                                    if (e.key === 'Escape') setEditingTeamName(null);
                                                                }}
                                                            />
                                                            <button onClick={() => renameTeam(team.id, editingTeamName.value)}
                                                                className="px-2 py-1 r-btn text-[10px] sans-font active-press flex-shrink-0"
                                                                style={{background:'var(--c-primary)', color:'var(--c-primary-text)', border:'1px solid var(--c-primary)'}}>
                                                                儲存
                                                            </button>
                                                            <button onClick={() => setEditingTeamName(null)}
                                                                className="px-2 py-1 bg-slate-100 r-btn text-[10px] sans-font active-press flex-shrink-0"
                                                                style={{border:'1px solid var(--c-border)'}}>
                                                                取消
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <p className="sans-font text-sm truncate" style={{color:'var(--c-text)'}}>{team.name}</p>
                                                    )}
                                                    <p className="text-[10px] sans-font" style={{color:'var(--c-muted)'}}>{memberCount} 位成員</p>
                                                </div>
                                            </div>
                                            {editingTeamName?.id !== team.id && (
                                                <div className="flex gap-1.5 flex-shrink-0">
                                                    <button onClick={() => setEditingTeamName({ id: team.id, value: team.name })}
                                                        className="w-8 h-8 r-btn flex items-center justify-center active-press hover:bg-blue-50"
                                                        style={{border:'1px solid var(--c-border)'}}>
                                                        <Icon name="Pencil" size={14} style={{color:'var(--c-primary-text)'}} />
                                                    </button>
                                                    <button onClick={() => deleteTeam(team)}
                                                        className="w-8 h-8 r-btn flex items-center justify-center active-press hover:bg-red-50"
                                                        style={{border:'1px solid var(--c-border)'}}>
                                                        <Icon name="Trash2" size={14} style={{color:'var(--c-danger-text)'}} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {memberCount > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-1 pl-12">
                                                {users.filter(u => u.teamId === team.id).map(u => (
                                                    <span key={u.uid} className="text-[10px] bg-slate-100 px-2 py-0.5 r-badge sans-font truncate max-w-[120px]" style={{color:'var(--c-text-sub)'}}>
                                                        {u.displayName || u.email}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Users tab ── */}
                    {tab === 'users' && (
                        <div className="space-y-3">
                            {/* 搜尋 */}
                            <div className="bg-white px-3 py-2 r-card card-shadow flex items-center gap-2">
                                <Icon name="Search" size={14} style={{color:'var(--c-muted)'}} />
                                <input
                                    type="text"
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    placeholder="搜尋名稱或 Email..."
                                    className="flex-1 text-xs sans-font focus:outline-none bg-transparent"
                                    style={{color:'var(--c-text)'}}
                                />
                                {searchText && <button onClick={() => setSearchText('')} style={{color:'var(--c-muted)'}}><Icon name="X" size={13} /></button>}
                            </div>

                            {loading && <p className="text-center text-xs sans-font py-4" style={{color:'var(--c-muted)'}}>載入中...</p>}

                            {users
                                .filter(u => {
                                    const q = searchText.toLowerCase();
                                    return !q || (u.displayName||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q);
                                })
                                .map(u => {
                                const teamName = teams.find(t => t.id === u.teamId)?.name;
                                const isActive = u.active !== false;
                                const isEditingThisName = editingName?.uid === u.uid;
                                return (
                                    <div key={u.uid} className="bg-white p-4 r-card card-shadow"
                                        style={{opacity: isActive ? 1 : 0.55, border: isActive ? '' : '1px solid var(--c-danger)'}}>

                                        {/* 行1：名稱 + 停用標籤 */}
                                        <div className="flex items-center gap-2 mb-1">
                                            {isEditingThisName ? (
                                                <input
                                                    autoFocus
                                                    className="flex-1 sans-font text-sm px-2 py-0.5 r-btn focus:outline-none"
                                                    style={{border:'1.5px solid var(--c-primary)', color:'var(--c-text)'}}
                                                    value={editingName.value}
                                                    onChange={e => setEditingName(prev => ({...prev, value: e.target.value}))}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') saveDisplayName(u.uid, editingName.value);
                                                        if (e.key === 'Escape') setEditingName(null);
                                                    }}
                                                />
                                            ) : (
                                                <p className="flex-1 sans-font text-sm truncate" style={{color:'var(--c-text)'}}>{u.displayName || '（未設定）'}</p>
                                            )}
                                            {!isActive && <span className="text-[9px] px-2 py-0.5 r-badge sans-font" style={{background:'var(--c-danger-bg)',color:'var(--c-danger-text)'}}>已停用</span>}
                                        </div>

                                        {/* 行2：Email */}
                                        <p className="text-[10px] sans-font truncate mb-1.5" style={{color:'var(--c-muted)'}}>{u.email || '（無 Email）'}</p>

                                        {/* 行3：分組標籤 */}
                                        {teamName
                                            ? (() => {
                                                const teamIndex = teams.findIndex(t => t.id === u.teamId);
                                                const color = teamColors[teamIndex % teamColors.length];
                                                return (
                                                    <span className={`text-[10px] ${color} px-2 py-0.5 r-badge sans-font inline-flex items-center gap-1`} style={{color:'white'}}>
                                                        <span style={{width:'14px', height:'14px', display:'flex', alignItems:'center', justifyContent:'center'}}>
                                                            {getTeamSymbol(teamIndex)}
                                                        </span>
                                                        {teamName}
                                                    </span>
                                                );
                                            })()
                                            : <span className="text-[10px] px-2 py-0.5 r-badge sans-font inline-block" style={{background:'var(--c-danger-bg)',color:'var(--c-danger-text)'}}>無陣營</span>
                                        }

                                        {/* 行4：操作按鈕 */}
                                        <div className="flex gap-2 mt-3 flex-wrap">
                                            {/* 改名 */}
                                            {isEditingThisName ? (
                                                <>
                                                    <button onClick={() => saveDisplayName(u.uid, editingName.value)}
                                                        className="px-3 py-1.5 r-btn text-[10px] sans-font active-press"
                                                        style={{background:'var(--c-primary)',color:'var(--c-primary-text)',border:'1px solid var(--c-primary)'}}>
                                                        儲存
                                                    </button>
                                                    <button onClick={() => setEditingName(null)}
                                                        className="px-3 py-1.5 bg-slate-100 r-btn text-[10px] sans-font active-press" style={{border:'1px solid var(--c-border)'}}>
                                                        取消
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => setEditingName({ uid: u.uid, value: u.displayName || '' })}
                                                    className="px-3 py-1.5 bg-slate-100 r-btn text-[10px] sans-font active-press" style={{border:'1px solid var(--c-border)'}}>
                                                    改名稱
                                                </button>
                                            )}

                                            {/* 換組 */}
                                            <button onClick={() => setMovingUser({ uid: u.uid, name: u.displayName || u.email })}
                                                className="px-3 py-1.5 bg-slate-100 r-btn text-[10px] sans-font active-press" style={{border:'1px solid var(--c-border)'}}>
                                                換組
                                            </button>

                                            {/* 移出陣營 */}
                                            {u.teamId && (
                                                <button onClick={() => removeUserFromTeam(u.uid)}
                                                    className="px-3 py-1.5 r-btn text-[10px] sans-font active-press"
                                                    style={{background:'var(--c-danger-bg)',border:'1px solid var(--c-danger)',color:'var(--c-danger-text)'}}>
                                                    移出陣營
                                                </button>
                                            )}

                                            {/* 啟用/停用 */}
                                            <button onClick={() => toggleActive(u.uid, u.active)}
                                                className="px-3 py-1.5 r-btn text-[10px] sans-font active-press ml-auto"
                                                style={{
                                                    background: isActive ? '#fff0f0' : '#f0fdf4',
                                                    border: isActive ? '1px solid var(--c-danger)' : '1px solid var(--c-success)',
                                                    color: isActive ? 'var(--c-danger-text)' : '#166534'
                                                }}>
                                                {isActive ? '停用帳號' : '重新啟用'}
                                            </button>
                                        </div>

                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── 打卡稽核 tab ── */}
                    {tab === 'audit' && (
                        <div className="space-y-3">
                            <div className="bg-white p-4 r-card card-shadow">
                                <p className="sans-font text-xs tracking-widest mb-1" style={{color:'var(--c-muted)'}}>選擇成員查看打卡紀錄</p>
                                <p className="sans-font text-[10px]" style={{color:'var(--c-text-sub)'}}>點選成員可展開每日打卡明細，管理員可刪除指定日期的紀錄，等級將自動重算。</p>
                            </div>

                            {users.length === 0 && <p className="text-center text-xs sans-font py-4" style={{color:'var(--c-muted)'}}>尚無成員資料</p>}

                            {users.map(u => {
                                const teamName = teams.find(t => t.id === u.teamId)?.name;
                                const isOpen = auditUser?.uid === u.uid;
                                return (
                                    <div key={u.uid} className="bg-white r-card card-shadow overflow-hidden">
                                        {/* 成員列 */}
                                        <div className="flex items-center gap-3 p-4">
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="sans-font text-sm" style={{color:'var(--c-text)'}}>{u.displayName || '（未設定）'}</span>
                                                    {teamName && (
                                                        <span className="text-[9px] px-1.5 py-0.5 r-badge sans-font" style={{background:'#e0f2fe', color:'var(--c-primary-text)', border:'1px solid #74c0fc'}}>
                                                            {teamName}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="sans-font text-[10px] mt-0.5" style={{color:'var(--c-muted)'}}>{u.email || ''}</span>
                                            </div>
                                            <button
                                                onClick={() => openAudit(u)}
                                                className="px-3 py-1.5 r-btn text-[10px] sans-font active-press flex-shrink-0"
                                                style={{
                                                    background: isOpen ? '#dcfce7' : '#f8fafc',
                                                    border: isOpen ? '1px solid #86efac' : '1px solid var(--c-border)',
                                                    color: isOpen ? '#166534' : 'var(--c-text-sub)'
                                                }}>
                                                {isOpen ? '▲ 收起' : '▼ 查看打卡'}
                                            </button>
                                        </div>

                                        {/* 打卡明細展開區 */}
                                        {isOpen && (
                                            <div style={{borderTop:'1px solid var(--c-border)', background:'#f8fafc', padding:'16px'}}>
                                                {auditLoading && (
                                                    <p className="sans-font text-xs text-center py-4" style={{color:'var(--c-muted)'}}>載入中...</p>
                                                )}

                                                {!auditLoading && (() => {
                                                    // ── 本月統計（用於 chips）──
                                                    const now = new Date();
                                                    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
                                                    let mActiveDays=0, mExMins=0, mStretchMins=0, mPracCount=0;
                                                    auditLogs.forEach(log => {
                                                        if (!log.date.startsWith(monthPrefix)) return;
                                                        const p=log.practice||0, e=log.exerciseTime||0, s=log.stretchTime||0, f=log.fiveMin||0;
                                                        if ((p+e+s+f)>0) mActiveDays++;
                                                        mExMins+=e; mStretchMins+=s; mPracCount+=p;
                                                    });
                                                    const mTotalHours = (mExMins+mStretchMins)/60;
                                                    const mExHours = mExMins/60;
                                                    const mStrHours = mStretchMins/60;
                                                    const mTotalScore = Math.round((mActiveDays*10) + mTotalHours + (mPracCount*5));

                                                    // ── 全時間累積（用於等級）──
                                                    let allActiveDays=0, allExMins=0, allStrMins=0, allPrac=0;
                                                    auditLogs.forEach(log => {
                                                        const p=log.practice||0, e=log.exerciseTime||0, s=log.stretchTime||0, f=log.fiveMin||0;
                                                        if ((p+e+s+f)>0) allActiveDays++;
                                                        allExMins+=e; allStrMins+=s; allPrac+=p;
                                                    });
                                                    const allScore = Math.round((allActiveDays*10) + (allExMins+allStrMins)/60 + (allPrac*5));
                                                    const lv = (() => {
                                                        const thresholds = [{score:0,base:1},{score:50,base:10},{score:300,base:20},{score:1500,base:30},{score:5000,base:50},{score:15000,base:70},{score:40000,base:90}];
                                                        if (!allScore || allScore<=0) return 1;
                                                        let tier=thresholds[0];
                                                        for (const t of thresholds) { if (allScore>=t.score) tier=t; else break; }
                                                        const idx=thresholds.indexOf(tier);
                                                        const next=thresholds[idx+1];
                                                        if (!next) return Math.min(99, 90+Math.floor((allScore-40000)/500));
                                                        return tier.base+Math.floor(((allScore-tier.score)/(next.score-tier.score))*(next.base-tier.base));
                                                    })();

                                                    // ── 本週（系統週：週日~週六）過濾顯示列 ──
                                                    const weekSunday = new Date(now);
                                                    weekSunday.setDate(now.getDate() - now.getDay());
                                                    weekSunday.setHours(0,0,0,0);
                                                    const weekSaturday = new Date(weekSunday);
                                                    weekSaturday.setDate(weekSunday.getDate()+6);
                                                    weekSaturday.setHours(23,59,59,999);
                                                    const weekStart = `${weekSunday.getFullYear()}-${String(weekSunday.getMonth()+1).padStart(2,'0')}-${String(weekSunday.getDate()).padStart(2,'0')}`;
                                                    const weekEnd   = `${weekSaturday.getFullYear()}-${String(weekSaturday.getMonth()+1).padStart(2,'0')}-${String(weekSaturday.getDate()).padStart(2,'0')}`;
                                                    const weekLogs  = auditLogs.filter(l => l.date >= weekStart && l.date <= weekEnd);

                                                    return (
                                                        <>
                                                            {/* 標題列 */}
                                                            <div className="flex items-center justify-between mb-3">
                                                                <p className="sans-font text-xs" style={{color:'var(--c-text)', fontWeight:'700'}}>分數來源稽核</p>
                                                                <p className="sans-font text-[10px]" style={{color:'var(--c-muted)'}}>本月統計 / 本週明細</p>
                                                            </div>

                                                            {/* 本月分數 chips */}
                                                            {auditLogs.length > 0 && (
                                                                <div className="flex flex-wrap gap-2 mb-4">
                                                                    <span className="sans-font text-[10px] px-2 py-1 r-badge"
                                                                        style={{background:'#e0f2fe', color:'var(--c-primary-text)', border:'1px solid #74c0fc'}}>
                                                                        活躍天 {mActiveDays} × 10 = <b>{mActiveDays*10} 分</b>
                                                                    </span>
                                                                    <span className="sans-font text-[10px] px-2 py-1 r-badge"
                                                                        style={{background:'#f0fdf4', color:'#166534', border:'1px solid #86efac'}}>
                                                                        運動 {mExHours.toFixed(1)}h + 拉筋 {mStrHours.toFixed(1)}h = <b>{mTotalHours.toFixed(1)} 分</b>
                                                                    </span>
                                                                    <span className="sans-font text-[10px] px-2 py-1 r-badge"
                                                                        style={{background:'#fef9c3', color:'#92400e', border:'1px solid #fde68a'}}>
                                                                        練功 {mPracCount} 次 × 5 = <b>{mPracCount*5} 分</b>
                                                                    </span>
                                                                    <span className="sans-font text-[10px] px-2 py-1 r-badge"
                                                                        style={{background:'#dcfce7', color:'#166534', border:'1px solid #86efac', fontWeight:'700'}}>
                                                                        本月 {mTotalScore} 分 → Lv.{lv} ✓
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* 無紀錄 */}
                                                            {auditLogs.length === 0 && (
                                                                <p className="sans-font text-xs text-center py-4" style={{color:'var(--c-muted)'}}>此成員尚無任何打卡紀錄</p>
                                                            )}

                                                            {/* 本週標題 + 表格欄頭 */}
                                                            {auditLogs.length > 0 && (
                                                                <>
                                                                <p className="sans-font text-[10px] mb-1" style={{color:'var(--c-muted)'}}>
                                                                    本週（{weekStart.slice(5).replace('-','/')} – {weekEnd.slice(5).replace('-','/')}）
                                                                </p>
                                                                <div className="flex items-center pb-1.5 mb-1"
                                                                    style={{borderBottom:'1.5px solid var(--c-border-strong)'}}>
                                                                    <span className="sans-font text-[9px]" style={{color:'var(--c-muted)', width:'36px', flexShrink:0}}>日期</span>
                                                                    <span className="sans-font text-[9px]" style={{color:'var(--c-muted)', flex:1, textAlign:'center'}}>練功/次</span>
                                                                    <span className="sans-font text-[9px]" style={{color:'var(--c-muted)', flex:1, textAlign:'center'}}>5min/次</span>
                                                                    <span className="sans-font text-[9px]" style={{color:'var(--c-muted)', flex:1, textAlign:'center'}}>運動/h</span>
                                                                    <span className="sans-font text-[9px]" style={{color:'var(--c-muted)', flex:1, textAlign:'center'}}>拉筋/h</span>
                                                                    <span className="sans-font text-[9px]" style={{color:'var(--c-muted)', width:'36px', textAlign:'center', flexShrink:0}}>得分</span>
                                                                    <span style={{width:'48px', flexShrink:0}}></span>
                                                                </div>
                                                                </>
                                                            )}

                                                            {/* 本週每日紀錄列 */}
                                                            {weekLogs.length === 0 && auditLogs.length > 0 && (
                                                                <p className="sans-font text-xs text-center py-3" style={{color:'var(--c-muted)'}}>本週尚無打卡紀錄</p>
                                                            )}
                                                            {weekLogs.map((log, li) => {
                                                                const hasActivity = ((log.practice||0)+(log.exerciseTime||0)+(log.stretchTime||0)+(log.fiveMin||0)) > 0;
                                                                const contrib = (hasActivity ? 10 : 0) + ((log.practice||0)*5) + ((log.exerciseTime||0)+(log.stretchTime||0))/60;
                                                                const isDel = deletingDate === log.date;
                                                                return (
                                                                    <div key={log.date}
                                                                        className="flex items-center py-1.5"
                                                                        style={{
                                                                            borderBottom: li < weekLogs.length-1 ? '1px solid var(--c-border)' : 'none',
                                                                            opacity: isDel ? 0.3 : 1,
                                                                            transition: 'opacity 0.2s',
                                                                        }}>
                                                                        <span className="sans-font text-xs" style={{color:'var(--c-text)', width:'36px', flexShrink:0, fontWeight:'700'}}>
                                                                            {log.date.slice(5).replace('-','/')}
                                                                        </span>
                                                                        <span className="sans-font text-xs" style={{flex:1, color:'var(--c-text)', textAlign:'center'}}>
                                                                            {log.practice||0}
                                                                        </span>
                                                                        <span className="sans-font text-xs" style={{flex:1, color:'var(--c-text)', textAlign:'center'}}>
                                                                            {log.fiveMin||0}
                                                                        </span>
                                                                        <span className="sans-font text-xs" style={{flex:1, color:'var(--c-text)', textAlign:'center'}}>
                                                                            {((log.exerciseTime||0)/60).toFixed(1)}
                                                                        </span>
                                                                        <span className="sans-font text-xs" style={{flex:1, color:'var(--c-text)', textAlign:'center'}}>
                                                                            {((log.stretchTime||0)/60).toFixed(1)}
                                                                        </span>
                                                                        <span className="sans-font text-[10px]" style={{color:'#d97706', fontWeight:'700', width:'36px', textAlign:'center', flexShrink:0}}>
                                                                            +{contrib.toFixed(1)}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => deleteOneLog(u.uid, log.date)}
                                                                            disabled={isDel}
                                                                            className="px-2 py-0.5 r-badge sans-font text-[10px] active-press flex-shrink-0"
                                                                            style={{
                                                                                background:'var(--c-danger-bg)',
                                                                                border:'1px solid var(--c-danger)',
                                                                                color:'var(--c-danger-text)',
                                                                                width:'48px', textAlign:'center'
                                                                            }}>
                                                                            {isDel ? '中...' : '刪除'}
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}

                                                            {/* 說明框 */}
                                                            {auditLogs.length > 0 && (
                                                                <div className="mt-4 p-3 r-btn flex items-start gap-2"
                                                                    style={{background:'#fffbeb', border:'1px solid #fde68a'}}>
                                                                    <span style={{color:'#d97706', fontSize:'13px', flexShrink:0}}>ⓘ</span>
                                                                    <p className="sans-font text-[10px]" style={{color:'#92400e', lineHeight:'1.6'}}>
                                                                        等級計算正常，分數來源可追溯。若懷疑資料不實，可由管理員刪除特定日期的紀錄，等級將自動重算。
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Move user modal */}
                    {movingUser && (
                        <div className="fixed inset-0 z-50 flex items-end justify-center overlay-blur p-5">
                            <div className="w-full max-w-sm bg-white r-card neo-border neo-shadow p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="sans-font text-sm" style={{color:'var(--c-text)'}}>將 <span style={{color:'var(--c-primary-text)'}}>{movingUser.name}</span> 移至...</p>
                                    <button onClick={() => setMovingUser(null)} style={{color:'var(--c-muted)'}}><Icon name="X" size={18} /></button>
                                </div>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {teams.map((team, i) => (
                                        <button key={team.id} onClick={() => moveUserToTeam(movingUser.uid, team.id, team.name)}
                                            className="w-full flex items-center gap-3 p-3 r-card active-press hover:bg-slate-50" style={{border:'1px solid var(--c-border)'}}>
                                            <div className={`w-7 h-7 ${teamColors[i % teamColors.length]} r-btn flex items-center justify-center neo-border-thin`}>
                                                <Icon name="Sword" size={13} />
                                            </div>
                                            <span className="sans-font text-sm" style={{color:'var(--c-text)'}}>{team.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* ── Pizza tab ── */}
                    {tab === 'pizza' && (
                        <div className="space-y-4">

                            {/* 發送卡片 */}
                            <div className="bg-white p-4 r-card card-shadow space-y-4">
                                <p className="sans-font text-xs tracking-widest" style={{color:'var(--c-muted)'}}>🍕 發送切片</p>

                                {/* Mode toggle */}
                                <div className="flex r-btn overflow-hidden" style={{border:'1px solid var(--c-border)', padding:'2px', gap:'2px'}}>
                                    {[{key:'team',label:'整個陣營'},{key:'member',label:'個別成員'}].map(m => (
                                        <button key={m.key}
                                            onClick={() => { setPizzaSendMode(m.key); setPizzaSelectedTeamId(null); setPizzaSelectedUids([]); }}
                                            className="flex-1 py-1.5 r-btn sans-font text-xs transition-all"
                                            style={{
                                                background: pizzaSendMode === m.key ? 'var(--c-accent)' : 'transparent',
                                                color: pizzaSendMode === m.key ? 'var(--c-accent-text)' : 'var(--c-muted)',
                                                fontWeight: pizzaSendMode === m.key ? '700' : '400',
                                            }}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Team mode: pick a team */}
                                {pizzaSendMode === 'team' && (
                                    <div>
                                        <p className="sans-font text-xs mb-2" style={{color:'var(--c-text-sub)'}}>選擇陣營</p>
                                        <div className="space-y-2">
                                            {teams.map(t => {
                                                const mems = users.filter(u => u.teamId === t.id);
                                                const sel = pizzaSelectedTeamId === t.id;
                                                return (
                                                    <button key={t.id}
                                                        onClick={() => setPizzaSelectedTeamId(sel ? null : t.id)}
                                                        className="w-full flex items-center gap-3 px-3 py-2.5 r-btn active-press transition-all text-left"
                                                        style={{
                                                            background: sel ? '#fef9c3' : '#f8fafc',
                                                            border: sel ? '2px solid var(--c-accent)' : '1.5px solid var(--c-border)',
                                                        }}>
                                                        <span style={{fontSize:'20px'}}></span>
                                                        <div style={{flex:1}}>
                                                            <p className="sans-font text-sm" style={{color:'var(--c-text)', fontWeight: sel ? '700':'400'}}>{t.name}</p>
                                                            <p className="sans-font" style={{fontSize:'10px', color:'var(--c-muted)'}}>
                                                                {mems.length} 位成員{mems.length > 0 ? '：' + mems.map(u => u.displayName||u.email).join('、') : ''}
                                                            </p>
                                                        </div>
                                                        {sel && <span style={{color:'#d97706', fontSize:'16px'}}>✓</span>}
                                                    </button>
                                                );
                                            })}
                                            {teams.length === 0 && <p className="sans-font text-xs text-center py-3" style={{color:'var(--c-muted)'}}>尚無陣營</p>}
                                        </div>
                                        {pizzaSelectedTeamId && users.filter(u => u.teamId === pizzaSelectedTeamId).length === 0 && (
                                            <p className="sans-font text-xs mt-2" style={{color:'#ef4444'}}>⚠️ 此陣營目前沒有成員</p>
                                        )}
                                    </div>
                                )}

                                {/* Member mode: pick individuals */}
                                {pizzaSendMode === 'member' && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="sans-font text-xs" style={{color:'var(--c-text-sub)'}}>選擇成員（可多選）</p>
                                            {pizzaSelectedUids.length > 0 && (
                                                <button onClick={() => setPizzaSelectedUids([])} className="sans-font text-xs" style={{color:'#ef4444'}}>清除全部</button>
                                            )}
                                        </div>
                                        {teams.map(t => {
                                            const mems = users.filter(u => u.teamId === t.id);
                                            if (mems.length === 0) return null;
                                            return (
                                                <div key={t.id} className="mb-3">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <p className="sans-font text-xs" style={{color:'var(--c-muted)'}}> {t.name}</p>
                                                        <button
                                                            onClick={() => {
                                                                const ids = mems.map(u => u.uid);
                                                                const allSel = ids.every(id => pizzaSelectedUids.includes(id));
                                                                setPizzaSelectedUids(prev => allSel ? prev.filter(x => !ids.includes(x)) : [...new Set([...prev, ...ids])]);
                                                            }}
                                                            className="sans-font px-1.5 py-0.5 r-badge"
                                                            style={{fontSize:'9px', background:'#f3f4f6', color:'var(--c-muted)', border:'1px solid var(--c-border)'}}>
                                                            {mems.every(u => pizzaSelectedUids.includes(u.uid)) ? '取消全選' : '全選'}
                                                        </button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {mems.map(u => {
                                                            const sel = pizzaSelectedUids.includes(u.uid);
                                                            return (
                                                                <button key={u.uid}
                                                                    onClick={() => setPizzaSelectedUids(prev => prev.includes(u.uid) ? prev.filter(x => x !== u.uid) : [...prev, u.uid])}
                                                                    className="px-2.5 py-1 r-badge sans-font text-xs active-press transition-all"
                                                                    style={{
                                                                        background: sel ? 'var(--c-accent)' : '#f3f4f6',
                                                                        color: sel ? 'var(--c-accent-text)' : 'var(--c-text-sub)',
                                                                        border: sel ? '1.5px solid #d97706' : '1px solid var(--c-border)',
                                                                        fontWeight: sel ? '700' : '400',
                                                                    }}>
                                                                    {u.displayName || u.email}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {users.filter(u => !u.teamId).length > 0 && (
                                            <div className="mb-3">
                                                <p className="sans-font text-xs mb-1.5" style={{color:'var(--c-muted)'}}>無陣營</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {users.filter(u => !u.teamId).map(u => {
                                                        const sel = pizzaSelectedUids.includes(u.uid);
                                                        return (
                                                            <button key={u.uid}
                                                                onClick={() => setPizzaSelectedUids(prev => prev.includes(u.uid) ? prev.filter(x => x !== u.uid) : [...prev, u.uid])}
                                                                className="px-2.5 py-1 r-badge sans-font text-xs active-press transition-all"
                                                                style={{
                                                                    background: sel ? 'var(--c-accent)' : '#f3f4f6',
                                                                    color: sel ? 'var(--c-accent-text)' : 'var(--c-text-sub)',
                                                                    border: sel ? '1.5px solid #d97706' : '1px solid var(--c-border)',
                                                                    fontWeight: sel ? '700' : '400',
                                                                }}>
                                                                {u.displayName || u.email}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Preview banner */}
                                {(() => {
                                    const recipients = pizzaSendMode === 'team'
                                        ? users.filter(u => u.teamId === pizzaSelectedTeamId)
                                        : users.filter(u => pizzaSelectedUids.includes(u.uid));
                                    if (recipients.length === 0) return null;
                                    return (
                                        <div className="px-3 py-2 r-btn" style={{background:'#fef9c3', border:'1px solid #fde68a'}}>
                                            <p className="sans-font text-xs" style={{color:'#92400e'}}>
                                                🍕 將發送給 <strong>{recipients.length} 人</strong>：{recipients.map(r => r.displayName||r.email).join('、')}
                                            </p>
                                        </div>
                                    );
                                })()}

                                {/* Slice count */}
                                <div>
                                    <p className="sans-font text-xs mb-2" style={{color:'var(--c-text-sub)'}}>每人獲得切片數</p>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setPizzaSliceCount(Math.max(1, pizzaSliceCount-1))}
                                            className="w-9 h-9 r-btn flex items-center justify-center sans-font text-xl active-press"
                                            style={{background:'#f3f4f6', border:'1.5px solid var(--c-border)'}}>−</button>
                                        <div className="flex flex-col items-center" style={{minWidth:'48px'}}>
                                            <span className="sans-font" style={{fontSize:'28px', fontWeight:'700', color:'var(--c-text)', lineHeight:1}}>{pizzaSliceCount}</span>
                                        </div>
                                        <button onClick={() => setPizzaSliceCount(Math.min(8, pizzaSliceCount+1))}
                                            className="w-9 h-9 r-btn flex items-center justify-center sans-font text-xl active-press"
                                            style={{background:'#f3f4f6', border:'1.5px solid var(--c-border)'}}>+</button>
                                    </div>
                                </div>

                                {/* Reason */}
                                <div>
                                    <p className="sans-font text-xs mb-1.5" style={{color:'var(--c-text-sub)'}}>原因（選填）</p>
                                    <input type="text" value={pizzaReason} onChange={e => setPizzaReason(e.target.value)}
                                        placeholder="例：本週全勤打卡！"
                                        className="w-full px-3 py-2 text-sm sans-font focus:outline-none bg-slate-50 r-btn"
                                        style={{border:'1px solid var(--c-border-strong)'}} />
                                </div>

                                {/* Send button */}
                                {(() => {
                                    const recipients = pizzaSendMode === 'team'
                                        ? users.filter(u => u.teamId === pizzaSelectedTeamId)
                                        : users.filter(u => pizzaSelectedUids.includes(u.uid));
                                    const canSend = recipients.length > 0 && !pizzaSending;
                                    const doSend = async () => {
                                        if (!canSend) return;
                                        setPizzaSending(true);
                                        try {
                                            const batch = db.batch();
                                            const logPromises = [];
                                            const affectedTeamIds = new Set();
                                            
                                            for (const u of recipients) {
                                                const snap = await db.collection('users').doc(u.uid).get();
                                                const cur = snap.data()?.pizzaSlices || 0;
                                                const total = snap.data()?.pizzaTotal || 8;
                                                const next = cur + pizzaSliceCount; // 不設上限，餘片累積到下一輪
                                                batch.update(db.collection('users').doc(u.uid), { pizzaSlices: next });
                                                logPromises.push(db.collection('pizzaLogs').add({
                                                    uid: u.uid,
                                                    displayName: u.displayName || u.email || '',
                                                    teamId: u.teamId || null,
                                                    teamName: u.teamName || null,
                                                    slices: pizzaSliceCount,
                                                    reason: pizzaReason.trim(),
                                                    sendMode: pizzaSendMode,
                                                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                                }));
                                                // 記錄受影響的陣營
                                                if (u.teamId) affectedTeamIds.add(u.teamId);
                                            }
                                            
                                            await batch.commit();
                                            await Promise.all(logPromises);
                                            
                                            // 發送留言板訊息給受影響的陣營
                                            const recipientNames = recipients.map(r => r.displayName || r.email).join('、');
                                            const pizzaMsgText = pizzaReason.trim()
                                                ? `🍕 管理員送出 Pizza 劵 ${pizzaSliceCount} 片給：${recipientNames}！\n原因：${pizzaReason.trim()}`
                                                : `🍕 管理員送出 Pizza 劵 ${pizzaSliceCount} 片給：${recipientNames}！`;

                                            // 個別模式：補回每位收件人的 teamId（有陣營的才通知）
                                            // 陣營模式：直接用 pizzaSelectedTeamId 確保一定送到
                                            const teamsToNotify = new Set(affectedTeamIds);
                                            if (pizzaSendMode === 'team' && pizzaSelectedTeamId) {
                                                teamsToNotify.add(pizzaSelectedTeamId);
                                            }

                                            for (const teamId of teamsToNotify) {
                                                try {
                                                    await db.collection('messages').doc(teamId)
                                                        .collection('chat').add({
                                                            uid: '[管理員]',
                                                            displayName: '🛡️ 系統公告',
                                                            text: pizzaMsgText,
                                                            teamId: teamId,
                                                            teamName: '',
                                                            likes: {},
                                                            isAdmin: true,
                                                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                                        });
                                                } catch(err) {
                                                    console.warn('發送留言板訊息失敗:', err);
                                                }
                                            }
                                            
                                            db.collection('pizzaLogs').orderBy('createdAt','desc').limit(30).get().then(snap2 => {
                                                const logs = []; snap2.forEach(d => logs.push({id:d.id,...d.data()})); setPizzaLogs(logs);
                                            });
                                            const cnt = recipients.length;
                                            const sliceSent = pizzaSliceCount;
                                            setPizzaSliceCount(1); setPizzaReason(''); setPizzaSending(false);
                                            setPizzaSelectedTeamId(null); setPizzaSelectedUids([]);
                                            alert('🍕 已發送 ' + sliceSent + ' 片給 ' + cnt + ' 位成員！\n已通知各陣營留言板');
                                        } catch(e) {
                                            alert('發送失敗：' + e.message);
                                            setPizzaSending(false);
                                        }
                                    };
                                    return (
                                        <button onClick={doSend} disabled={!canSend}
                                            className="w-full py-3 r-btn neo-border-thin sans-font active-press disabled:opacity-40 transition-all"
                                            style={{background: canSend ? 'var(--c-accent)' : '#f3f4f6', color: canSend ? 'var(--c-accent-text)' : 'var(--c-muted)', fontWeight:'700', fontSize:'15px'}}>
                                            {pizzaSending
                                                ? '發送中...'
                                                : recipients.length > 0
                                                    ? '🍕 確認發送 ' + pizzaSliceCount + ' 片 × ' + recipients.length + ' 人'
                                                    : '請先選擇' + (pizzaSendMode === 'team' ? '陣營' : '成員')}
                                        </button>
                                    );
                                })()}
                            </div>

                            {/* 成員 Pizza 狀態 */}
                            <div className="bg-white p-4 r-card card-shadow">
                                <p className="sans-font text-xs tracking-widest mb-3" style={{color:'var(--c-muted)'}}>成員 Pizza 狀態</p>
                                {teams.map(t => {
                                    const mems = users.filter(u => u.teamId === t.id);
                                    if (mems.length === 0) return null;
                                    return (
                                        <div key={t.id} className="mb-4">
                                            <p className="sans-font text-xs mb-2" style={{color:'var(--c-muted)'}}> {t.name}</p>
                                            <div className="space-y-2">
                                                {mems.map(u => {
                                                    const slices = u.pizzaSlices || 0;
                                                    const total = u.pizzaTotal || 8;
                                                    const completedR = Math.floor(slices / total);
                                                    const curSlicesR = slices % total;
                                                    const displayS = (curSlicesR === 0 && slices > 0) ? total : curSlicesR;
                                                    const pct = Math.round(displayS/total*100);
                                                    const done = curSlicesR === 0 && slices > 0;
                                                    return (
                                                        <div key={u.uid} className="flex items-center gap-2">
                                                            <span className="sans-font text-xs truncate" style={{width:'72px', color: done ? '#d97706' : 'var(--c-text)', fontWeight: done ? '700':'400'}}>{u.displayName||u.email}</span>
                                                            <div style={{flex:1, height:'8px', background:'#f3f4f6', borderRadius:'4px', overflow:'hidden'}}>
                                                                <div style={{height:'100%', width:`${pct}%`, background: done ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#fde68a,#fbbf24)', borderRadius:'4px', transition:'width 0.5s'}}></div>
                                                            </div>
                                                            <span className="sans-font" style={{fontSize:'10px', color: done ? '#d97706':'var(--c-muted)', minWidth:'48px', textAlign:'right', fontWeight: done?'700':'400'}}>
                                                                {done?'🍕 待兌換':''}
                                                                {completedR > 0 && !done ? `×${completedR}+` : ''}{displayS}/{total}
                                                            </span>
                                                            <button
                                                                onClick={async () => {
                                                                    const userName = u.displayName||u.email;
                                                                    const reason = window.prompt(`重置「${userName}」的 Pizza劵\n\n請輸入原因：`);
                                                                    if (reason === null) return;
                                                                    if (!reason.trim()) { alert('請輸入原因'); return; }
                                                                    
                                                                    const slices = u.pizzaSlices || 0;
                                                                    await db.collection('pizzaLogs').add({
                                                                        uid: u.uid,
                                                                        displayName: userName,
                                                                        teamId: u.teamId || null,
                                                                        teamName: u.teamName || null,
                                                                        slices: -slices,
                                                                        reason: `[重置] ${reason.trim()}`,
                                                                        sendMode: 'reset',
                                                                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                                                    });
                                                                    await db.collection('users').doc(u.uid).update({ pizzaSlices: 0 });
                                                                    db.collection('pizzaLogs').orderBy('createdAt','desc').limit(30).get().then(snap2 => {
                                                                        const logs = []; snap2.forEach(d => logs.push({id:d.id,...d.data()})); setPizzaLogs(logs);
                                                                    });
                                                                    alert('✓ 已重置並記錄');
                                                                }}
                                                                className="w-6 h-6 r-btn flex items-center justify-center active-press flex-shrink-0"
                                                                style={{border:'1px solid var(--c-border)'}}>
                                                                <Icon name="RotateCcw" size={10} style={{color:'var(--c-muted)'}} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                                {users.filter(u => !u.teamId).length > 0 && (
                                    <div>
                                        <p className="sans-font text-xs mb-2" style={{color:'var(--c-muted)'}}>無陣營</p>
                                        <div className="space-y-2">
                                            {users.filter(u => !u.teamId).map(u => {
                                                const slices=u.pizzaSlices||0, total=u.pizzaTotal||8;
                                                const completedR=Math.floor(slices/total), curS=slices%total;
                                                const displayS=(curS===0&&slices>0)?total:curS;
                                                const pct=Math.round(displayS/total*100), done=curS===0&&slices>0;
                                                return (
                                                    <div key={u.uid} className="flex items-center gap-2">
                                                        <span className="sans-font text-xs truncate" style={{width:'72px',color:'var(--c-text)'}}>{u.displayName||u.email}</span>
                                                        <div style={{flex:1,height:'8px',background:'#f3f4f6',borderRadius:'4px',overflow:'hidden'}}>
                                                            <div style={{height:'100%',width:`${pct}%`,background: done?'linear-gradient(90deg,#fbbf24,#f59e0b)':'linear-gradient(90deg,#fde68a,#fbbf24)',borderRadius:'4px',transition:'width 0.5s'}}></div>
                                                        </div>
                                                        <span className="sans-font" style={{fontSize:'10px',color:done?'#d97706':'var(--c-muted)',minWidth:'48px',textAlign:'right'}}>
                                                            {done?'🍕 待兌換':''}
                                                            {completedR>0&&!done?`×${completedR}+`:''}{displayS}/{total}
                                                        </span>
                                                        <button
                                                            onClick={async () => {
                                                                const userName = u.displayName||u.email;
                                                                const reason = window.prompt(`重置「${userName}」的 Pizza劵\n\n請輸入原因：`);
                                                                if (reason === null) return;
                                                                if (!reason.trim()) { alert('請輸入原因'); return; }
                                                                
                                                                const slices = u.pizzaSlices || 0;
                                                                await db.collection('pizzaLogs').add({
                                                                    uid: u.uid,
                                                                    displayName: userName,
                                                                    teamId: null,
                                                                    teamName: null,
                                                                    slices: -slices,
                                                                    reason: `[重置] ${reason.trim()}`,
                                                                    sendMode: 'reset',
                                                                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                                                });
                                                                await db.collection('users').doc(u.uid).update({ pizzaSlices: 0 });
                                                                db.collection('pizzaLogs').orderBy('createdAt','desc').limit(30).get().then(snap2 => {
                                                                    const logs = []; snap2.forEach(d => logs.push({id:d.id,...d.data()})); setPizzaLogs(logs);
                                                                });
                                                                alert('✓ 已重置並記錄');
                                                            }}
                                                            className="w-6 h-6 r-btn flex items-center justify-center active-press flex-shrink-0"
                                                            style={{border:'1px solid var(--c-border)'}}>
                                                            <Icon name="RotateCcw" size={10} style={{color:'var(--c-muted)'}} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 發送紀錄 */}
                            <div className="bg-white p-4 r-card card-shadow">
                                <p className="sans-font text-xs tracking-widest mb-3" style={{color:'var(--c-muted)'}}>發送紀錄</p>
                                {pizzaLogsLoading && <p className="text-xs sans-font text-center py-3" style={{color:'var(--c-muted)'}}>載入中...</p>}
                                {!pizzaLogsLoading && pizzaLogs.length === 0 && <p className="text-xs sans-font text-center py-3" style={{color:'var(--c-muted)'}}>尚無紀錄</p>}
                                <div>
                                    {pizzaLogs.map(log => {
                                        const teamIndex = teams.findIndex(t => t.id === log.teamId);
                                        const color = teamIndex >= 0 ? teamColors[teamIndex % teamColors.length] : null;
                                        return (
                                            <div key={log.id} className="flex items-start gap-2 py-2.5" style={{borderBottom:'1px solid #f9fafb'}}>
                                                <span style={{fontSize:'15px', flexShrink:0}}>🍕</span>
                                                <div style={{flex:1, minWidth:0}}>
                                                    <p className="sans-font text-xs" style={{color:'var(--c-text)'}}>
                                                        {log.teamName && color ? (
                                                            <span className={`${color} px-1.5 py-0.5 r-badge text-[9px] inline-flex items-center gap-0.5 mr-1`} style={{color:'white', verticalAlign:'middle'}}>
                                                                <span style={{width:'12px', height:'12px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px'}}>
                                                                    {getTeamSymbol(teamIndex)}
                                                                </span>
                                                                {log.teamName}
                                                            </span>
                                                        ) : log.teamName ? (
                                                            <span style={{color:'var(--c-muted)', marginRight:'4px'}}>【{log.teamName}】</span>
                                                        ) : null}
                                                        {log.displayName}
                                                        {log.slices < 0 ? (
                                                            <span style={{color:'#ef4444', fontWeight:'700'}}> {log.slices} 片</span>
                                                        ) : (
                                                            <span style={{color:'#d97706', fontWeight:'700'}}> +{log.slices} 片</span>
                                                        )}
                                                    </p>
                                                    {log.reason ? <p className="sans-font mt-0.5" style={{fontSize:'10px', color:'var(--c-muted)'}}>{log.reason}</p> : null}
                                                </div>
                                                <span className="sans-font flex-shrink-0" style={{fontSize:'9px', color:'var(--c-muted)'}}>
                                                    {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString('zh-TW',{month:'2-digit',day:'2-digit'}) : ''}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            );
        };
