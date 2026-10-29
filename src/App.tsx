import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle, CalendarDays, Check, ChevronRight, CircleHelp, ClipboardList,
  LoaderCircle, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, X,
} from 'lucide-react';

type Pokemon = {
  codigo: number;
  nome: string;
  altura: number | null;
  peso: number | null;
  categoria: string | null;
  dataDaCaptura: string;
};

type PokemonForm = {
  codigo: string;
  nome: string;
  altura: string;
  peso: string;
  categoria: string;
  dataDaCaptura: string;
};

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
const EMPTY_FORM: PokemonForm = {
  codigo: '', nome: '', altura: '', peso: '', categoria: '', dataDaCaptura: '',
};

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', ...init?.headers },
      // Não enviar cookies, autenticação ou credenciais.
      credentials: 'omit',
    });
  } catch {
    throw new ApiError(`Não foi possível conectar à API em ${API_URL}. Confira se o backend está rodando e se o endereço está correto.`, 0);
  }

  if (!response.ok) {
    const raw = response.status === 204 ? '' : await response.text().catch(() => '');
    let message = raw.trim();
    if (message) {
      try {
        const parsed: unknown = JSON.parse(message);
        if (parsed && typeof parsed === 'object') {
          const body = parsed as Record<string, unknown>;
          const detailErrors = Array.isArray(body.errors) ? body.errors.map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const err = item as Record<string, unknown>;
              return [err.field, err.defaultMessage || err.message].filter(Boolean).join(': ');
            }
            return String(item);
          }).filter(Boolean).join(' · ') : '';
          const candidates = [body.message, body.detail, body.title, body.error];
          message = detailErrors || (candidates.find((value) => typeof value === 'string' && value.trim()) as string) || JSON.stringify(parsed);
        }
      } catch {
        // O corpo pode ser uma mensagem de texto simples do Spring.
      }
    }
    if (!message) {
      message = response.status === 400
        ? 'A API recusou os dados enviados. Confira os campos e tente novamente.'
        : response.status === 404
          ? 'O Pokémon solicitado não foi encontrado.'
          : `A API respondeu com status ${response.status}.`;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function toForm(pokemon: Pokemon): PokemonForm {
  return {
    codigo: String(pokemon.codigo),
    nome: pokemon.nome ?? '',
    altura: pokemon.altura == null ? '' : String(pokemon.altura),
    peso: pokemon.peso == null ? '' : String(pokemon.peso),
    categoria: pokemon.categoria ?? '',
    dataDaCaptura: pokemon.dataDaCaptura ?? '',
  };
}

function formatDate(value: string) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function validate(form: PokemonForm, editing: boolean): string | null {
  if (!editing && (!form.codigo.trim() || !Number.isSafeInteger(Number(form.codigo)) || Number(form.codigo) <= 0)) {
    return 'Informe um código inteiro positivo para o Pokémon.';
  }
  if (!form.nome.trim()) return 'O nome é obrigatório.';
  for (const [label, value] of [['Altura', form.altura], ['Peso', form.peso]] as const) {
    if (value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return `${label} deve ser um número maior ou igual a zero.`;
    }
  }
  if (!form.dataDaCaptura) return 'A data da captura é obrigatória.';
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (form.dataDaCaptura >= todayString) return 'A data da captura deve ser anterior a hoje.';
  return null;
}

function formPayload(form: PokemonForm): Pokemon {
  return {
    codigo: Number(form.codigo),
    nome: form.nome.trim(),
    altura: form.altura.trim() === '' ? null : Number(form.altura),
    peso: form.peso.trim() === '' ? null : Number(form.peso),
    categoria: form.categoria.trim() || null,
    dataDaCaptura: form.dataDaCaptura,
  };
}

function App() {
  const [pokemons, setPokemons] = useState<Pokemon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<PokemonForm>(EMPTY_FORM);
  const [editingCode, setEditingCode] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchCode, setSearchCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<Pokemon | null>(null);
  const [searchError, setSearchError] = useState('');
  const [deletingCode, setDeletingCode] = useState<number | null>(null);

  const loadPokemons = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setPageError('');
    try {
      const data = await request<Pokemon[]>('/pokemons');
      setPokemons(Array.isArray(data) ? data : []);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setPokemons([]);
      } else {
        setPageError(error instanceof Error ? error.message : 'Não foi possível carregar os Pokémon.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadPokemons(); }, [loadPokemons]);

  const sortedPokemons = useMemo(
    () => [...pokemons].sort((a, b) => a.codigo - b.codigo),
    [pokemons],
  );

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingCode(null);
    setFormError('');
  }

  function beginEdit(pokemon: Pokemon) {
    setForm(toForm(pokemon));
    setEditingCode(pokemon.codigo);
    setFormError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setFormError('');
    const message = validate(form, editingCode !== null);
    if (message) {
      setFormError(message);
      return;
    }
    setSaving(true);
    try {
      const payload = formPayload(form);
      if (editingCode !== null) {
        await request<Pokemon>(`/pokemons/${editingCode}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setNotice(`Pokémon #${editingCode} atualizado com sucesso.`);
      } else {
        await request<Pokemon>('/pokemons', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(`${payload.nome} foi cadastrado com sucesso.`);
      }
      resetForm();
      await loadPokemons(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o Pokémon.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pokemon: Pokemon) {
    const confirmed = window.confirm(`Tem certeza de que deseja excluir ${pokemon.nome} (código ${pokemon.codigo})? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;
    setDeletingCode(pokemon.codigo);
    setNotice('');
    setPageError('');
    try {
      await request<void>(`/pokemons/${pokemon.codigo}`, { method: 'DELETE' });
      setNotice(`${pokemon.nome} foi excluído.`);
      if (editingCode === pokemon.codigo) resetForm();
      if (searchResult?.codigo === pokemon.codigo) setSearchResult(null);
      await loadPokemons(true);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Não foi possível excluir o Pokémon.');
    } finally {
      setDeletingCode(null);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchError('');
    setSearchResult(null);
    const code = Number(searchCode);
    if (!searchCode.trim() || !Number.isSafeInteger(code) || code <= 0) {
      setSearchError('Digite um código inteiro positivo.');
      return;
    }
    setSearching(true);
    try {
      const pokemon = await request<Pokemon>(`/pokemons/${code}`);
      setSearchResult(pokemon);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Não foi possível buscar o Pokémon.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#" aria-label="Pokédex início" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <span className="brand-mark"><span /></span>
            <span>Poké<span className="brand-light">dex</span></span>
          </a>
          <div className="api-status"><span className="status-dot" /> API REST <span className="status-divider">·</span> Spring Boot</div>
        </div>
      </header>

      <main className="main-content">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> SUA COLEÇÃO, ORGANIZADA</div>
            <h1>Todos eles,<br /><span>em um só lugar.</span></h1>
            <p>Cadastre, encontre e gerencie os Pokémon da sua coleção.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="pokeball"><div className="ball-top" /><div className="ball-bottom" /><div className="ball-band" /><div className="ball-center"><span /></div></div>
            <span className="spark spark-a">✳</span><span className="spark spark-b">✦</span><span className="spark spark-c">·</span>
          </div>
        </section>

        <section className="stats-row" aria-label="Resumo da coleção">
          <div className="stat-card">
            <span className="stat-icon red-icon"><ClipboardList size={19} /></span>
            <div><span className="stat-label">Na coleção</span><strong>{loading ? '—' : pokemons.length}</strong></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon green-icon"><ShieldCheck size={19} /></span>
            <div><span className="stat-label">Conexão</span><strong className={pageError ? 'text-error' : 'text-green'}>{pageError ? 'Verificar' : loading ? 'Conectando' : 'API pronta'}</strong></div>
          </div>
          <div className="stat-card stat-hint">
            <span className="stat-icon yellow-icon"><CircleHelp size={19} /></span>
            <div><span className="stat-label">Dica rápida</span><strong>Use o código para buscar</strong></div>
          </div>
        </section>

        {notice && <div className="alert alert-success" role="status"><Check size={18} /><span>{notice}</span><button aria-label="Fechar mensagem" onClick={() => setNotice('')}><X size={17} /></button></div>}
        {pageError && <div className="alert alert-error" role="alert"><AlertCircle size={19} /><div><strong>Não foi possível concluir a operação</strong><span>{pageError}</span></div><button className="alert-action" onClick={() => void loadPokemons()}><RefreshCw size={15} /> Tentar novamente</button></div>}

        <section className="workspace">
          <aside className="form-panel panel">
            <div className="panel-heading">
              <div className="heading-icon"><Plus size={19} /></div>
              <div><h2>{editingCode === null ? 'Adicionar Pokémon' : `Editar #${editingCode}`}</h2><p>{editingCode === null ? 'Preencha os dados para cadastrar.' : 'Altere os campos e salve as mudanças.'}</p></div>
            </div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="field-grid">
                <label className="field field-full">
                  <span>Código <em>*</em></span>
                  <input type="number" min="1" step="1" placeholder="Ex.: 25" value={form.codigo} disabled={editingCode !== null} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                  {editingCode !== null && <small>O código não pode ser alterado.</small>}
                </label>
                <label className="field field-full">
                  <span>Nome <em>*</em></span>
                  <input type="text" maxLength={120} placeholder="Ex.: Pikachu" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </label>
                <label className="field">
                  <span>Altura <small>(m)</small></span>
                  <input type="number" min="0" step="any" placeholder="0,0" value={form.altura} onChange={(e) => setForm({ ...form, altura: e.target.value })} />
                </label>
                <label className="field">
                  <span>Peso <small>(kg)</small></span>
                  <input type="number" min="0" step="any" placeholder="0,0" value={form.peso} onChange={(e) => setForm({ ...form, peso: e.target.value })} />
                </label>
                <label className="field field-full">
                  <span>Categoria</span>
                  <input type="text" maxLength={100} placeholder="Ex.: Pokémon Rato" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
                </label>
                <label className="field field-full">
                  <span>Data da captura <em>*</em></span>
                  <div className="input-with-icon"><CalendarDays size={17} /><input type="date" max={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()} value={form.dataDaCaptura} onChange={(e) => setForm({ ...form, dataDaCaptura: e.target.value })} /></div>
                  <small>A data deve ser anterior a hoje.</small>
                </label>
              </div>
              {formError && <div className="inline-error" role="alert"><AlertCircle size={16} /><span>{formError}</span></div>}
              <div className="form-actions">
                <button type="submit" className="button button-primary" disabled={saving}>
                  {saving ? <LoaderCircle className="spin" size={17} /> : editingCode === null ? <Plus size={17} /> : <Check size={17} />}
                  {saving ? 'Salvando...' : editingCode === null ? 'Cadastrar Pokémon' : 'Salvar alterações'}
                </button>
                {editingCode !== null && <button type="button" className="button button-secondary" onClick={resetForm} disabled={saving}>Cancelar</button>}
              </div>
              <p className="required-note"><span>*</span> Campos obrigatórios</p>
            </form>
          </aside>

          <section className="collection-panel panel">
            <div className="collection-heading">
              <div><div className="section-kicker">ENCICLOPÉDIA</div><h2>Sua Pokédex <span className="count-pill">{loading ? '…' : pokemons.length}</span></h2></div>
              <button className="icon-button" title="Atualizar lista" aria-label="Atualizar lista" onClick={() => void loadPokemons(true)} disabled={refreshing || loading}>{refreshing ? <LoaderCircle className="spin" size={18} /> : <RefreshCw size={18} />}</button>
            </div>

            <form className="search-bar" onSubmit={handleSearch}>
              <Search size={18} />
              <input type="number" min="1" step="1" placeholder="Buscar por código..." value={searchCode} onChange={(e) => setSearchCode(e.target.value)} aria-label="Código do Pokémon" />
              {searchCode && <button type="button" className="search-clear" onClick={() => { setSearchCode(''); setSearchResult(null); setSearchError(''); }} aria-label="Limpar busca"><X size={16} /></button>}
              <button className="search-submit" type="submit" disabled={searching}>{searching ? <LoaderCircle className="spin" size={17} /> : 'Buscar'}</button>
            </form>

            {searchError && <div className="search-feedback error-feedback" role="alert"><AlertCircle size={16} />{searchError}</div>}
            {searchResult && <div className="search-result">
              <div className="result-mon">{searchResult.nome.slice(0, 1).toUpperCase()}</div>
              <div className="result-info"><span>RESULTADO DA BUSCA · #{searchResult.codigo}</span><strong>{searchResult.nome}</strong><small>{searchResult.categoria || 'Categoria não informada'} · Capturado em {formatDate(searchResult.dataDaCaptura)}</small></div>
              <button className="icon-button" onClick={() => beginEdit(searchResult)} aria-label={`Editar ${searchResult.nome}`} title="Editar"><Pencil size={17} /></button>
              <button className="icon-button danger-icon" onClick={() => void handleDelete(searchResult)} aria-label={`Excluir ${searchResult.nome}`} title="Excluir" disabled={deletingCode === searchResult.codigo}><Trash2 size={17} /></button>
              <button className="icon-button" onClick={() => setSearchResult(null)} aria-label="Fechar resultado"><X size={17} /></button>
            </div>}

            <div className="list-caption"><span>POKÉMON REGISTRADOS</span><span>{loading ? 'Carregando...' : `${pokemons.length} ${pokemons.length === 1 ? 'registro' : 'registros'}`}</span></div>

            {loading ? (
              <div className="state-panel"><LoaderCircle className="spin state-spinner" size={30} /><strong>Carregando sua coleção</strong><p>Buscando os dados no servidor...</p></div>
            ) : pageError ? (
              <div className="state-panel"><div className="empty-symbol error-symbol"><AlertCircle size={25} /></div><strong>Não conseguimos carregar a lista</strong><p>{pageError}</p><button className="button button-secondary" onClick={() => void loadPokemons()}><RefreshCw size={16} /> Tentar novamente</button></div>
            ) : sortedPokemons.length === 0 ? (
              <div className="state-panel"><div className="empty-symbol"><ClipboardList size={25} /></div><strong>Sua coleção está vazia</strong><p>Quando houver Pokémon cadastrados na API, eles aparecerão aqui. Você pode começar pelo formulário ao lado.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Pokémon</th><th>Altura / Peso</th><th>Captura</th><th className="actions-head">Ações</th></tr></thead>
                  <tbody>
                    {sortedPokemons.map((pokemon) => (
                      <tr key={pokemon.codigo}>
                        <td><div className="pokemon-cell"><div className={`pokemon-avatar avatar-${Math.abs(pokemon.codigo) % 5}`}>{pokemon.nome.trim().slice(0, 1).toUpperCase() || '?'}</div><div><strong>{pokemon.nome}</strong><span>#{pokemon.codigo}{pokemon.categoria ? ` · ${pokemon.categoria}` : ''}</span></div></div></td>
                        <td><div className="measure-cell"><span>{pokemon.altura == null ? '—' : `${pokemon.altura} m`}</span><span>{pokemon.peso == null ? '—' : `${pokemon.peso} kg`}</span></div></td>
                        <td className="date-cell">{formatDate(pokemon.dataDaCaptura)}</td>
                        <td><div className="row-actions"><button className="icon-button" title="Editar Pokémon" aria-label={`Editar ${pokemon.nome}`} onClick={() => beginEdit(pokemon)}><Pencil size={16} /></button><button className="icon-button danger-icon" title="Excluir Pokémon" aria-label={`Excluir ${pokemon.nome}`} onClick={() => void handleDelete(pokemon)} disabled={deletingCode === pokemon.codigo}>{deletingCode === pokemon.codigo ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !pageError && sortedPokemons.length > 0 && <div className="table-footer"><span><span className="footer-dot" /> Dados carregados da API</span><span>Ordenado por código <ChevronRight size={14} /></span></div>}
          </section>
        </section>

        <footer className="footer"><span>POKÉDEX <span className="footer-separator">/</span> GERENCIADOR DE COLEÇÃO</span><span>Interface conectada à sua API Spring Boot</span></footer>
      </main>
    </div>
  );
}

export default App;
