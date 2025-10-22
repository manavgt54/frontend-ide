import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Trash2, Edit, Save, X, RefreshCw } from 'lucide-react';

const API_BASE_URL = 'http://157.66.191.31:5006/api';

const modeExamples = {
  sse: `{
  "mcpServers": {
    "gitea": { "url": "http://localhost:8080/sse" }
  }
}`,
  http: `{
  "mcpServers": {
    "gitea": { "url": "http://localhost:8080/mcp" }
  }
}`,
  stdio: `{
  "mcpServers": {
    "gitea": {
      "command": "gitea-mcp",
      "args": ["-t","stdio","--host","https://gitea.com"],
      "env": {"GITEA_ACCESS_TOKEN": "<your personal access token>"}
    }
  }
}`
};

function deepMerge(a, b) {
  const out = Array.isArray(a) ? [...a] : { ...(a || {}) };
  if (Array.isArray(b)) return [...(a || []), ...b];
  Object.entries(b || {}).forEach(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  });
  return out;
}

export default function MCPManager() {
  const [settingsJSON, setSettingsJSON] = useState('');
  const [mode, setMode] = useState('sse');
  const [singleServerName, setSingleServerName] = useState('');
  const [settingsServers, setSettingsServers] = useState([]);
  const [editingName, setEditingName] = useState(null);
  const [editingConfig, setEditingConfig] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshAll = async () => {
    try {
      setBusy(true);
      const sres = await fetch(`${API_BASE_URL}/mcp/settings`);
      if (sres.ok) {
        const sdata = await sres.json();
        setSettingsJSON(JSON.stringify(sdata.settings || {}, null, 2));
      }
      const lres = await fetch(`${API_BASE_URL}/mcp/settings/servers`);
      if (lres.ok) {
        const ldata = await lres.json();
        setSettingsServers(ldata.servers || []);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refreshAll(); }, []);

  const handleSaveSettings = async () => {
    try {
      const body = JSON.parse(settingsJSON || '{}');
      const url = singleServerName.trim() ? `${API_BASE_URL}/mcp/settings?serverName=${encodeURIComponent(singleServerName.trim())}` : `${API_BASE_URL}/mcp/settings`;
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        setSettingsJSON(JSON.stringify(data.settings || {}, null, 2));
        await refreshAll();
        if (data.warnings?.length) alert(data.warnings.join('\n'));
      } else {
        alert(data.error || res.status);
      }
    } catch (e) {
      alert('Invalid JSON');
    }
  };

  const startEdit = (name, cfg) => {
    setEditingName(name);
    setEditingConfig(JSON.stringify(cfg || {}, null, 2));
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditingConfig('');
  };

  const saveServer = async () => {
    try {
      const cfg = JSON.parse(editingConfig || '{}');
      const res = await fetch(`${API_BASE_URL}/mcp/settings/servers/${encodeURIComponent(editingName)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg)
      });
      const data = await res.json();
      if (res.ok) {
        cancelEdit();
        await refreshAll();
      } else {
        alert(data.error || res.status);
      }
    } catch (e) {
      alert('Invalid JSON');
    }
  };

  const deleteServer = async (name) => {
    if (!confirm(`Delete MCP server '${name}'?`)) return;
    const res = await fetch(`${API_BASE_URL}/mcp/settings/servers/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      await refreshAll();
    } else {
      alert(data.error || res.status);
    }
  };

  const insertExample = () => {
    try {
      const current = JSON.parse(settingsJSON || '{}');
      const example = JSON.parse(modeExamples[mode]);
      const merged = deepMerge(current, example);
      setSettingsJSON(JSON.stringify(merged, null, 2));
    } catch (e) {
      setSettingsJSON(modeExamples[mode]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h3 className="text-lg font-semibold">MCP Servers</h3>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gemini CLI settings.json</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-2">
            <div>
              <Label>Mode examples</Label>
              <select className="w-full border rounded px-2 py-2" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="sse">SSE</option>
                <option value="http">HTTP</option>
                <option value="stdio">STDIO</option>
              </select>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" onClick={() => setSettingsJSON(modeExamples[mode])}>Load {mode.toUpperCase()} example</Button>
                <Button variant="outline" onClick={insertExample}>Insert example</Button>
              </div>
            </div>
            <div>
              <Label>Single server name (optional)</Label>
              <Input value={singleServerName} onChange={(e) => setSingleServerName(e.target.value)} placeholder="e.g. gitea" />
              <div className="text-xs text-gray-500 mt-1">Use when pasting a single-server object without mcpServers</div>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleSaveSettings} disabled={busy}>Save Settings</Button>
              <Button variant="outline" onClick={refreshAll} disabled={busy}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
            </div>
          </div>
          <Textarea rows={12} value={settingsJSON} onChange={(e) => setSettingsJSON(e.target.value)} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsServers.map((s) => (
          <Card key={s.name} className="relative">
            <CardHeader>
              <CardTitle className="text-sm">{s.name}</CardTitle>
              <CardDescription className="text-xs">{s.config.url ? 'SSE/HTTP' : 'STDIO'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {editingName === s.name ? (
                <>
                  <Textarea rows={10} value={editingConfig} onChange={(e) => setEditingConfig(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveServer}><Save className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}><X className="w-3 h-3 mr-1" />Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto">
{JSON.stringify(s.config, null, 2)}
                  </pre>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => startEdit(s.name, s.config)}><Edit className="w-3 h-3 mr-1" />Edit</Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => deleteServer(s.name)}><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
        {!settingsServers.length && (
          <div className="text-sm text-gray-600">No MCP servers configured yet.</div>
        )}
      </div>
    </div>
  );
} 