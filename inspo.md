import React, { useState } from 'react';
import {
Layout, Calendar as CalendarIcon, Grid, Settings,
Plus, Image as ImageIcon, MessageSquare, Hash,
Clock, MoreHorizontal, X, Instagram, Edit3,
Sparkles, AlignLeft, LayoutPanelLeft, ChevronRight,
Smartphone, GripVertical, Wand2
} from 'lucide-react';

// --- MOCK DATA --- //
const MOCK_POSTS = [
{
id: '124',
title: 'Vintage Surf Branding Showcase',
status: 'in-progress',
date: '2026-03-15T10:00:00Z',
platforms: ['Instagram', 'TikTok'],
tags: ['design', 'portfolio'],
caption: 'Riding the wave of nostalgia with our latest branding project for Homme Made. We went deep into the 70s surf archives to pull out these warm, sun-faded palettes.\n\n#branding #surf #design #hommemade',
image: 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&q=80&w=800&h=1000'
},
{
id: '125',
title: 'Agency Q1 Reel Launch',
status: 'ready',
date: '2026-03-20T14:00:00Z',
platforms: ['LinkedIn', 'Instagram'],
tags: ['agency', 'video'],
caption: 'Everything we touched in Q1. A massive shoutout to the motion team for bringing these frames to life. Sound ON for this one. 🔈',
image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800&h=1000'
},
{
id: '126',
title: 'Coffee Client Setup Shot',
status: 'idea',
date: null,
platforms: ['Instagram'],
tags: ['bts', 'photography'],
caption: 'Behind the scenes at the morning shoot.',
image: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&q=80&w=800&h=1000'
}
];

export default function App() {
const [activeTab, setActiveTab] = useState('kanban');
const [selectedPostId, setSelectedPostId] = useState(null);
const [inspectorMode, setInspectorMode] = useState('edit');

const selectedPost = MOCK_POSTS.find(p => p.id === selectedPostId);

const WindowControls = () => (
<div className="flex gap-2 mb-8 px-2 group">
<div className="w-3 h-3 rounded-full bg-red-400/80 border border-red-500/50 flex items-center justify-center group-hover:bg-red-500 transition-colors"></div>
<div className="w-3 h-3 rounded-full bg-amber-400/80 border border-amber-500/50 flex items-center justify-center group-hover:bg-amber-500 transition-colors"></div>
<div className="w-3 h-3 rounded-full bg-green-400/80 border border-green-500/50 flex items-center justify-center group-hover:bg-green-500 transition-colors"></div>
</div>
);

const KanbanCard = ({ post }) => (
<div
onClick={() => {
setSelectedPostId(post.id);
setInspectorMode('edit');
}}
className={`group p-4 rounded-2xl cursor-pointer transition-all duration-300 relative
        ${selectedPostId === post.id 
          ? 'bg-white/90 dark:bg-gray-800/90 shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-purple-500/50 scale-[1.02]' 
          : 'bg-white/40 dark:bg-gray-800/40 hover:bg-white/70 dark:hover:bg-gray-800/70 shadow-sm border border-white/40 dark:border-white/5 hover:shadow-md'}
        backdrop-blur-md`} >
{/_ Drag Handle Indicator _/}
<div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 cursor-grab active:cursor-grabbing">
<GripVertical size={16} />
</div>

      {post.image && (
        <div className="aspect-video w-full rounded-xl mb-3 overflow-hidden bg-gray-100 dark:bg-gray-800">
          <img src={post.image} alt="post media" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        </div>
      )}
      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1 leading-snug pr-6">{post.title}</h4>
      <div className="flex items-center gap-2 mt-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1 bg-gray-900/5 dark:bg-white/10 px-2 py-1 rounded-md font-medium">
          <Instagram size={12} />
          {post.platforms[0]}
        </span>
        {post.tags.length > 0 && (
          <span className="flex items-center gap-0.5 truncate">
            <Hash size={12} /> {post.tags[0]}
          </span>
        )}
      </div>
    </div>

);

const CalendarView = () => {
// Generate a simple 5-week grid for demo purposes
const days = Array.from({ length: 35 }, (\_, i) => i + 1);

    return (
      <div className="flex-1 p-8 flex flex-col h-full overflow-hidden">
        <div className="grid grid-cols-7 gap-4 mb-4">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-4 flex-1">
          {days.map(day => {
            // Mocking dates to place our MOCK_POSTS on the calendar
            const mockDateNum = day - 5; // offset for the month start
            const isToday = mockDateNum === 15; // March 15th
            const postOnDay = MOCK_POSTS.find(p => p.date && new Date(p.date).getDate() === mockDateNum);

            return (
              <div key={day} className={`rounded-2xl p-2 flex flex-col transition-colors border
                ${isToday ? 'bg-purple-500/10 border-purple-500/30' : 'bg-white/20 dark:bg-white/5 border-white/20 dark:border-white/5 hover:bg-white/40 dark:hover:bg-white/10'}
              `}>
                <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1
                  ${isToday ? 'bg-purple-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-400'}`}>
                  {mockDateNum > 0 && mockDateNum <= 31 ? mockDateNum : ''}
                </span>

                {postOnDay && (
                  <div
                    onClick={() => {
                      setSelectedPostId(postOnDay.id);
                      setInspectorMode('preview');
                    }}
                    className="mt-1 bg-white/80 dark:bg-gray-800/90 rounded-lg p-1.5 shadow-sm text-[10px] font-medium text-gray-800 dark:text-gray-200 truncate border border-black/5 dark:border-white/10 cursor-pointer hover:ring-1 ring-purple-500 transition-all"
                  >
                    <span className="w-1.5 h-1.5 rounded-full inline-block mr-1.5 bg-green-400"></span>
                    {postOnDay.title}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );

};

return (
<div className="min-h-screen w-full bg-gradient-to-br from-indigo-100 via-purple-100 to-rose-100 dark:from-slate-950 dark:via-purple-950/50 dark:to-slate-950 flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-purple-300 selection:text-purple-900">

      <div className="w-full max-w-[1400px] h-[85vh] flex rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] ring-1 ring-white/50 dark:ring-white/10 overflow-hidden relative bg-white/10 dark:bg-black/20">

        {/* SIDEBAR */}
        <div className="w-64 border-r border-white/30 dark:border-white/5 bg-white/40 dark:bg-gray-900/60 backdrop-blur-3xl p-4 flex flex-col shrink-0 z-10">
          <WindowControls />

          <div className="mb-8 px-2">
            <h2 className="text-xs font-semibold text-gray-500/80 dark:text-gray-400 tracking-wider uppercase mb-3">Workspace</h2>
            <nav className="space-y-1">
              {[
                { id: 'kanban', icon: Layout, label: 'Kanban Board' },
                { id: 'calendar', icon: CalendarIcon, label: 'Calendar' },
                { id: 'assets', icon: ImageIcon, label: 'Media Library' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
                    ${activeTab === item.id
                      ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                  <item.icon size={16} strokeWidth={activeTab === item.id ? 2.5 : 2} className={activeTab === item.id ? 'text-purple-600 dark:text-purple-400' : ''} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="px-2">
            <h2 className="text-xs font-semibold text-gray-500/80 dark:text-gray-400 tracking-wider uppercase mb-3">Clients</h2>
            <nav className="space-y-1">
              {['Homme Made', 'TechFlow HQ', 'Personal Brand'].map(client => (
                <button key={client} className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                  <span className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 border border-indigo-500/30 group-hover:scale-125 transition-transform"></div>
                    {client}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-auto px-2">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              <Settings size={16} />
              Settings
            </button>
          </div>
        </div>

        {/* MAIN CANVAS */}
        <div className="flex-1 relative flex flex-col overflow-hidden bg-white/20 dark:bg-black/10 backdrop-blur-md">
          {/* Header */}
          <header className="h-16 border-b border-white/30 dark:border-white/5 px-8 flex items-center justify-between shrink-0 bg-white/10 dark:bg-transparent">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {activeTab === 'kanban' ? 'Kanban Board' : activeTab === 'calendar' ? 'Content Calendar' : 'Media Assets'}
              <ChevronRight size={16} className="text-gray-400" />
              <span className="text-gray-500 font-normal text-base">Homme Made</span>
            </h1>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-b from-gray-800 to-gray-900 dark:from-white dark:to-gray-200 text-white dark:text-gray-900 rounded-full text-sm font-medium shadow-[0_2px_10px_rgba(0,0,0,0.15)] hover:scale-105 hover:shadow-[0_4px_15px_rgba(0,0,0,0.2)] transition-all border border-black/10 dark:border-white/10">
                <Plus size={16} /> New Post
              </button>
            </div>
          </header>

          {/* Dynamic Board Area */}
          {activeTab === 'kanban' ? (
            <div className="flex-1 overflow-x-auto p-8 custom-scrollbar">
              <div className="flex gap-6 h-full items-start min-w-[800px]">

                {/* Column: Idea */}
                <div className="w-80 flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]"></div> Idea
                    </h3>
                    <span className="text-xs font-semibold text-gray-500 bg-white/40 dark:bg-white/10 px-2 py-0.5 rounded-full shadow-sm">1</span>
                  </div>
                  {MOCK_POSTS.filter(p => p.status === 'idea').map(post => <KanbanCard key={post.id} post={post} />)}
                </div>

                {/* Column: In Progress */}
                <div className="w-80 flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"></div> In Progress
                    </h3>
                    <span className="text-xs font-semibold text-gray-500 bg-white/40 dark:bg-white/10 px-2 py-0.5 rounded-full shadow-sm">1</span>
                  </div>
                  {MOCK_POSTS.filter(p => p.status === 'in-progress').map(post => <KanbanCard key={post.id} post={post} />)}
                </div>

                {/* Column: Ready */}
                <div className="w-80 flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div> Ready
                    </h3>
                    <span className="text-xs font-semibold text-gray-500 bg-white/40 dark:bg-white/10 px-2 py-0.5 rounded-full shadow-sm">1</span>
                  </div>
                  {MOCK_POSTS.filter(p => p.status === 'ready').map(post => <KanbanCard key={post.id} post={post} />)}
                </div>

              </div>
            </div>
          ) : activeTab === 'calendar' ? (
            <CalendarView />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">Media Library Placeholder</div>
          )}
        </div>

        {/* FLOATING INSPECTOR PANEL */}
        <div className={`absolute top-4 right-4 bottom-4 w-[420px] bg-white/70 dark:bg-gray-900/80 backdrop-blur-3xl border border-white/50 dark:border-white/10 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.3)] rounded-[2rem] transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col z-50
          ${selectedPostId ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0 pointer-events-none'}`}
        >
          {selectedPost && (
            <>
              {/* Inspector Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/30 dark:border-white/5 shrink-0">
                <div className="flex bg-black/5 dark:bg-white/10 p-1 rounded-full">
                  <button
                    onClick={() => setInspectorMode('edit')}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${inspectorMode === 'edit' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    <span className="flex items-center gap-1.5"><Edit3 size={12}/> Editor</span>
                  </button>
                  <button
                    onClick={() => setInspectorMode('preview')}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${inspectorMode === 'preview' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    <span className="flex items-center gap-1.5"><LayoutPanelLeft size={12}/> Preview</span>
                  </button>
                </div>
                <button onClick={() => setSelectedPostId(null)} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors">
                  <X size={16} className="text-gray-500" />
                </button>
              </div>

              {/* Inspector Content */}
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">

                {inspectorMode === 'edit' ? (
                  <div className="space-y-6 pb-6">
                    {/* Frontmatter Form */}
                    <div className="space-y-4">
                      <input
                        type="text"
                        defaultValue={selectedPost.title}
                        className="w-full bg-transparent text-2xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none border-b border-transparent focus:border-purple-500/50 pb-1 transition-colors"
                        placeholder="Post Title..."
                      />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white/50 dark:bg-black/20 p-3 rounded-2xl border border-white/50 dark:border-white/5 hover:border-purple-300/50 transition-colors">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1 block">Status</label>
                          <select className="bg-transparent w-full font-medium text-gray-800 dark:text-gray-200 focus:outline-none cursor-pointer appearance-none">
                            <option value="idea">Idea</option>
                            <option value="in-progress">In Progress</option>
                            <option value="ready">Ready</option>
                          </select>
                        </div>
                        <div className="bg-white/50 dark:bg-black/20 p-3 rounded-2xl border border-white/50 dark:border-white/5 hover:border-purple-300/50 transition-colors cursor-pointer">
                          <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1 block">Publish Date</label>
                          <div className="font-medium text-gray-800 dark:text-gray-200">{selectedPost.date ? new Date(selectedPost.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : 'Unscheduled'}</div>
                        </div>
                      </div>
                    </div>

                    {/* Media Dropzone */}
                    <div className="aspect-[4/3] w-full rounded-[1.5rem] bg-white/40 dark:bg-black/20 border-2 border-dashed border-white/60 dark:border-white/10 flex flex-col items-center justify-center text-gray-400 hover:bg-white/60 hover:border-purple-400/50 transition-all duration-300 cursor-pointer overflow-hidden group relative">
                      {selectedPost.image ? (
                        <>
                          <img src={selectedPost.image} alt="Media" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-all duration-300 flex items-center justify-center">
                            <span className="bg-white/20 text-white px-4 py-2 rounded-full font-medium flex items-center gap-2 shadow-lg"><ImageIcon size={16}/> Replace Media</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-white/50 dark:bg-white/5 flex items-center justify-center mb-3 shadow-sm">
                            <ImageIcon size={24} className="text-gray-500" />
                          </div>
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Drag & drop media here</span>
                        </>
                      )}
                    </div>

                    {/* Markdown Editor */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Caption (Markdown)</label>
                        <button className="text-xs px-3 py-1 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white rounded-full font-medium flex items-center gap-1.5 shadow-sm transition-all hover:shadow-md hover:scale-105 active:scale-95">
                          <Wand2 size={12}/> Magic Edit
                        </button>
                      </div>
                      <textarea
                        defaultValue={selectedPost.caption}
                        className="w-full h-48 bg-white/60 dark:bg-black/30 rounded-2xl p-4 text-gray-800 dark:text-gray-200 text-sm leading-relaxed focus:outline-none focus:ring-2 ring-purple-500/30 border border-white/50 dark:border-white/5 font-serif resize-none shadow-inner"
                      />
                    </div>
                  </div>
                ) : (
                  // --- BENTO BOX PREVIEW MODE ---
                  <div className="flex flex-col gap-4 pb-6">
                    <div className="bg-white/90 dark:bg-gray-950 rounded-[2rem] p-3 shadow-lg shadow-black/5 border border-white/50 dark:border-white/5">
                      <div className="flex items-center gap-2 px-2 pb-3 pt-1">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 p-[2px]">
                          <div className="w-full h-full bg-white dark:bg-black rounded-full border border-white dark:border-black overflow-hidden">
                            <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" alt="avatar" />
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">hommemade_studio</span>
                        <MoreHorizontal size={16} className="ml-auto text-gray-400" />
                      </div>
                      <div className="aspect-[4/5] w-full bg-gray-100 rounded-[1.25rem] overflow-hidden relative shadow-inner">
                        {selectedPost.image ? (
                           <img src={selectedPost.image} className="w-full h-full object-cover" alt="preview" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon size={48}/></div>
                        )}
                      </div>
                      <div className="p-2 pt-3">
                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans">
                          <span className="font-semibold mr-2">hommemade_studio</span>
                          {selectedPost.caption.substring(0, 100)}...
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/50 dark:bg-black/20 p-4 rounded-3xl border border-white/50 dark:border-white/5 flex flex-col justify-between aspect-square hover:bg-white/60 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                          <Hash size={20} className="text-blue-500" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Hashtags</p>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">
                            {selectedPost.tags.map(t => `#${t}`).join(' ')}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-rows-2 gap-3">
                        <div className="bg-white/50 dark:bg-black/20 p-4 rounded-[1.5rem] border border-white/50 dark:border-white/5 flex items-center justify-between hover:bg-white/60 transition-colors">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Networks</p>
                            <div className="flex gap-1.5 text-gray-800 dark:text-gray-200">
                              <Instagram size={16}/> <Smartphone size={16}/>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white/50 dark:bg-black/20 p-4 rounded-[1.5rem] border border-white/50 dark:border-white/5 flex items-center justify-between hover:bg-white/60 transition-colors">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Date</p>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                              {selectedPost.date ? new Date(selectedPost.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : 'TBD'}
                            </p>
                          </div>
                          <Clock size={16} className="text-emerald-500 opacity-80"/>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>

);
}
