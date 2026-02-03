import React, { useState, useMemo } from 'react';
import { User, Task, TaskStatus, Role, TaskComment } from '../types';
import { normalizeEmployeeId } from '../utils/dates'; // Using normalizeEmployeeId for consistency

const toInitials = (value?: string) => {
    const letters = (value || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    return letters.padEnd(2, 'X').slice(0, 2);
};

interface TaskBoardProps {
    tasks: Task[];
    users: User[];
    currentUser: User;
    isManager: boolean;
    onAddTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void;
    onDeleteTask: (taskId: string) => void;
}

const TaskBoard: React.FC<TaskBoardProps> = ({
    tasks,
    users,
    currentUser,
    isManager,
    onAddTask,
    onUpdateTask,
    onDeleteTask
}) => {
    const [filterAssignee, setFilterAssignee] = useState<string>('all');
    const [isAdding, setIsAdding] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);

    // Form States
    const [formTitle, setFormTitle] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [formAssignee, setFormAssignee] = useState('');
    const [formDate, setFormDate] = useState('');
    const [formStatus, setFormStatus] = useState<TaskStatus>('Todo');
    const [formProgress, setFormProgress] = useState('');
    const [commentInput, setCommentInput] = useState('');

    const visibleTasks = useMemo(() => {
        let filtered = tasks;
        if (!isManager) {
            filtered = tasks.filter(t => t.assigneeId === currentUser.id);
        } else if (filterAssignee !== 'all') {
            filtered = tasks.filter(t => t.assigneeId === filterAssignee);
        }
        return filtered;
    }, [tasks, isManager, currentUser.id, filterAssignee]);

    const columns: { id: TaskStatus; label: string; color: string; dot: string }[] = [
        { id: 'Todo', label: 'Action Queue', color: 'bg-slate-50/50', dot: 'bg-slate-300' },
        { id: 'In Progress', label: 'In Execution', color: 'bg-blue-50/30', dot: 'bg-blue-500' },
        { id: 'Done', label: 'Completed', color: 'bg-emerald-50/30', dot: 'bg-emerald-500' }
    ];

    const handleOpenAdd = () => {
        setFormTitle('');
        setFormDesc('');
        setFormAssignee('');
        setFormDate('');
        setFormStatus('Todo');
        setFormProgress('');
        setEditingTask(null);
        setIsAdding(true);
    };

    const handleOpenEdit = (task: Task) => {
        setFormTitle(task.title);
        setFormDesc(task.description);
        setFormAssignee(task.assigneeId);
        setFormDate(task.dueDate);
        setFormStatus(task.status);
        setFormProgress(task.progress || '');
        setEditingTask(task);
        setIsAdding(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formTitle.trim() || !formAssignee) return;

        if (editingTask) {
            onUpdateTask({
                ...editingTask,
                title: formTitle,
                description: formDesc,
                assigneeId: formAssignee,
                dueDate: formDate,
                status: formStatus,
                progress: formProgress
            });
        } else {
            const newTask: Task = {
                id: Math.random().toString(36).substr(2, 9),
                title: formTitle,
                description: formDesc,
                assigneeId: formAssignee,
                assignerId: currentUser.id,
                status: formStatus,
                dueDate: formDate,
                progress: formProgress,
                comments: [],
                createdAt: new Date().toISOString()
            };
            onAddTask(newTask);
        }
        setIsAdding(false);
    };

    const sortedUsers = [...users]
        .filter(u => u.role !== Role.SUPERADMIN)
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Strategic Task Board</h2>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Operational Oversight & Execution</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    {isManager && (
                        <div className="relative group min-w-[200px]">
                            <select
                                value={filterAssignee}
                                onChange={e => setFilterAssignee(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest outline-none focus:border-blue-500 shadow-sm transition-all appearance-none cursor-pointer pr-12"
                            >
                                <option value="all">Global Resource View</option>
                                {sortedUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>
                    )}
                    {isManager && (
                        <button
                            onClick={handleOpenAdd}
                            className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                            Dispatch Task
                        </button>
                    )}
                </div>
            </div>

            {/* Board Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {columns.map(col => (
                    <div key={col.id} className={`rounded-[3rem] p-8 ${col.color} min-h-[600px] border border-white/50 shadow-2xl shadow-slate-900/5 animate-in fade-in slide-in-from-bottom-4 duration-700`}>
                        <div className="flex justify-between items-center mb-8 px-2">
                            <div className="flex items-center gap-3">
                                <span className={`w-2.5 h-2.5 rounded-full ${col.dot} shadow-sm animate-pulse`}></span>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">{col.label}</h3>
                            </div>
                            <span className="bg-white/80 backdrop-blur-sm px-4 py-1.5 rounded-full text-[11px] font-black text-slate-600 border border-slate-100 shadow-sm">
                                {visibleTasks.filter(t => t.status === col.id).length}
                            </span>
                        </div>

                        <div className="space-y-6">
                            {visibleTasks.filter(t => t.status === col.id).length === 0 ? (
                                <div className="py-12 text-center border-2 border-dashed border-slate-200/50 rounded-[2.5rem] flex flex-col items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white/50 flex items-center justify-center text-slate-300">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                    </div>
                                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Zone Empty</p>
                                </div>
                            ) : (
                                visibleTasks.filter(t => t.status === col.id).map(task => {
                                    const assignee = users.find(u => u.id === task.assigneeId);
                                    const assigner = users.find(u => u.id === task.assignerId);
                                    return (
                                        <div key={task.id} className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-900/5 hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 group relative border border-white hover:border-blue-100 flex flex-col justify-between min-h-[180px]">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-start">
                                                    <span className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-[11px] font-black text-slate-600 uppercase tracking-widest">
                                                        {task.dueDate ? `Deadline: ${task.dueDate}` : 'No Deadline'}
                                                    </span>
                                                    {isManager && (
                                                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                            <button onClick={() => handleOpenEdit(task)} className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                            </button>
                                                            <button onClick={() => onDeleteTask(task.id)} className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-all shadow-sm">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900 leading-tight mb-2 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{task.title}</h4>
                                                    {task.description && (
                                    <p className="text-[11px] text-slate-500 line-clamp-2 font-medium leading-relaxed italic border-l-2 border-slate-100 pl-3">"{task.description}"</p>
                                )}
                                {task.progress && (
                                    <p className="mt-2 text-[11px] font-black text-blue-600 uppercase tracking-tight">Progress: {task.progress}</p>
                                )}
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-slate-50 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex -space-x-2">
                                                        <div className="w-7 h-7 rounded-lg bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] font-black text-blue-600 shadow-sm" title={`By: ${assigner?.name}`}>
                                                            {toInitials(assigner?.name || 'S')}
                                                        </div>
                                                        <div className="w-7 h-7 rounded-lg bg-slate-900 border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-sm" title={`To: ${assignee?.name}`}>
                                                            {toInitials(assignee?.name || '?')}
                                                        </div>
                                                    </div>
                                                    <div className="relative">
                                                        <select
                                                            value={task.status}
                                                            onChange={(e) => onUpdateTask({ ...task, status: e.target.value as TaskStatus })}
                                                            className="bg-slate-50 border-none text-[11px] font-black uppercase tracking-widest text-slate-600 rounded-xl py-2 pl-3 pr-8 outline-none focus:ring-1 focus:ring-blue-200 cursor-pointer appearance-none shadow-inner"
                                                        >
                                                            {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                                        </select>
                                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Comments */}
                                                <div className="mt-4 space-y-2 bg-slate-50 border border-slate-100 rounded-2xl p-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Progress Comments</span>
                                                        <span className="text-[10px] font-bold text-slate-400">{task.comments?.length || 0}</span>
                                                    </div>
                                                    <div className="space-y-3 max-h-40 overflow-y-auto pr-1">
                                                        {(task.comments || []).map(c => {
                                                            const author = users.find(u => u.id === c.authorId);
                                                            return (
                                                                <div key={c.id} className="bg-white rounded-xl border border-slate-100 px-3 py-2 shadow-sm">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[11px] font-black text-slate-700">{author?.name || 'Unknown'}</span>
                                                                        <span className="text-[10px] text-slate-400 font-bold">{new Date(c.createdAt).toLocaleString()}</span>
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-600 mt-1">{c.message}</p>
                                                                </div>
                                                            );
                                                        })}
                                                        {(task.comments || []).length === 0 && (
                                                            <p className="text-[11px] text-slate-400 italic">No comments yet.</p>
                                                        )}
                                                    </div>
                                                    <form
                                                        onSubmit={e => {
                                                            e.preventDefault();
                                                            if (!commentInput.trim()) return;
                                                            const comment: TaskComment = {
                                                                id: Math.random().toString(36).substr(2, 9),
                                                                authorId: currentUser.id,
                                                                message: commentInput.trim(),
                                                                createdAt: new Date().toISOString()
                                                            };
                                                            const nextComments = [...(task.comments || []), comment];
                                                            onUpdateTask({ ...task, comments: nextComments });
                                                            setCommentInput('');
                                                        }}
                                                        className="flex gap-2 mt-2"
                                                    >
                                                        <input
                                                            value={commentInput}
                                                            onChange={e => setCommentInput(e.target.value)}
                                                            placeholder="Add update..."
                                                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400"
                                                        />
                                                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow hover:bg-blue-500">Post</button>
                                                    </form>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Add/Edit Modal */}
            {isAdding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/20 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md animate-in fade-in zoom-in duration-200">
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest mb-6">{editingTask ? 'Edit Task' : 'New Task'}</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Title</label>
                                <input
                                    type="text"
                                    required
                                    value={formTitle}
                                    onChange={e => setFormTitle(e.target.value)}
                                    className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 text-sm"
                                    placeholder="Task title"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Description</label>
                                <textarea
                                    value={formDesc}
                                    onChange={e => setFormDesc(e.target.value)}
                                    className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 text-sm h-24 resize-none"
                                    placeholder="Details..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Assignee</label>
                                    <select
                                        required
                                        value={formAssignee}
                                        onChange={e => setFormAssignee(e.target.value)}
                                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 text-xs"
                                    >
                                        <option value="">Select...</option>
                                        {sortedUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Due Date</label>
                                    <input
                                        type="date"
                                        value={formDate}
                                        onChange={e => setFormDate(e.target.value)}
                                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 text-xs"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Progress</label>
                                <input
                                    type="text"
                                    value={formProgress}
                                    onChange={e => setFormProgress(e.target.value)}
                                    className="w-full px-5 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 text-sm"
                                    placeholder="e.g., 50% done, waiting on client..."
                                />
                            </div>
                            {editingTask && (
                                <div className="space-y-1">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">Status</label>
                                    <select
                                        value={formStatus}
                                        onChange={e => setFormStatus(e.target.value as TaskStatus)}
                                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 text-xs"
                                    >
                                        {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsAdding(false)}
                                    className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-lg"
                                >
                                    {editingTask ? 'Save Changes' : 'Create Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskBoard;
