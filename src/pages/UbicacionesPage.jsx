import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MapPin,
  Building,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Plus,
  X,
  Tag
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { toSafeDisplayString } from '../utils/jsonFormat';
import DateRangeFilter, { EMPTY_DATE_RANGE, dateRangeParams } from '../components/common/DateRangeFilter';

const DEPT_SHORT_LABELS = {
  INFORMATICA: 'INF',
  OFICINAS: 'OFI',
  COCINA: 'COC',
  ALMACEN: 'ALM'
};

function formatDeptShort(deptKey) {
  const upper = toSafeDisplayString(deptKey, '').trim().toUpperCase();
  return DEPT_SHORT_LABELS[upper] || (upper ? upper.slice(0, 4) : 'DEPT');
}

function pickMetricValue(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined && val !== null && typeof val !== 'object') {
      const num = Number(val);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

function extractStateSummary(stateObj) {
  if (!stateObj || typeof stateObj !== 'object') {
    return {
      destinoArticulos: null,
      destinoFisico: null,
      sinSedeArticulos: null,
      sinSedeFisico: null,
      globalArticulos: null,
      globalFisico: null
    };
  }
  const destinoSub = stateObj.campamento_destino || stateObj.destino || stateObj;
  const sinSedeSub = stateObj.sin_sede || stateObj.sin_sede_verificada || stateObj;
  const globalSub = stateObj.global || stateObj;

  return {
    destinoArticulos: pickMetricValue(destinoSub, [
      'total_articulos',
      'articulos',
      'campamento_destino_articulos',
      'destino_articulos'
    ]),
    destinoFisico: pickMetricValue(destinoSub, [
      'total_fisico',
      'unidades_fisicas',
      'unidades',
      'campamento_destino_unidades',
      'campamento_destino_fisico',
      'destino_unidades',
      'destino_fisico'
    ]),
    sinSedeArticulos: pickMetricValue(sinSedeSub, [
      'sin_sede_articulos',
      'total_articulos_sin_sede',
      ...(sinSedeSub !== stateObj ? ['total_articulos', 'articulos'] : [])
    ]),
    sinSedeFisico: pickMetricValue(sinSedeSub, [
      'sin_sede_unidades',
      'total_unidades_sin_sede',
      'sin_sede_fisico',
      'total_fisico_sin_sede',
      ...(sinSedeSub !== stateObj ? ['total_fisico', 'unidades_fisicas', 'unidades'] : [])
    ]),
    globalArticulos: pickMetricValue(globalSub, [
      'total_articulos_global',
      'total_global_articulos',
      'global_articulos',
      'total_general_articulos',
      ...(globalSub !== stateObj ? ['total_articulos', 'articulos'] : [])
    ]),
    globalFisico: pickMetricValue(globalSub, [
      'total_unidades_global',
      'total_global_fisico',
      'global_fisico',
      'total_general_fisico',
      ...(globalSub !== stateObj ? ['total_fisico', 'unidades_fisicas', 'unidades'] : [])
    ])
  };
}

function getAliasLabel(aliasObj) {
  if (!aliasObj) return '';
  if (typeof aliasObj === 'string') return aliasObj.trim();
  return toSafeDisplayString(
    aliasObj.alias_original || aliasObj.alias_normalizado || aliasObj.alias || aliasObj.nombre,
    ''
  ).trim();
}

function getCandidateId(cand) {
  return cand?.id ?? cand?.articulo_id ?? null;
}

function getCandidateReasonText(cand) {
  if (!cand || typeof cand !== 'object') return '';
  const raw =
    cand.motivos_bloqueo ??
    cand.motivos_revision ??
    cand.motivo_revision ??
    cand.motivos ??
    cand.razon_revision ??
    cand.alerta ??
    cand.observacion_revision;
  if (Array.isArray(raw)) {
    return raw.map(item => toSafeDisplayString(item, '')).filter(Boolean).join(' · ');
  }
  if (raw && typeof raw === 'object') {
    return toSafeDisplayString(raw.mensaje || raw.descripcion || raw, '');
  }
  return toSafeDisplayString(raw, '');
}

export default function UbicacionesPage() {
  const {
    kpis,
    campamentosCatalog,
    activeCampamento,
    currentUser,
    hasPermission,
    fetchArticulos,
    refreshKpis,
    refreshCampamentosCatalog,
    previewReasignacionAlias,
    aplicarReasignacionAlias
  } = useApp();

  const [selectedFilter, setSelectedFilter] = useState(() => {
    if (activeCampamento?.id) {
      return {
        mode: 'campamento',
        campamentoId: String(activeCampamento.id),
        ubicacionNombre: activeCampamento.ubicacion_historica_equivalente || activeCampamento.nombre || '',
        label: toSafeDisplayString(activeCampamento.nombre, `Sede #${activeCampamento.id}`)
      };
    }
    return null;
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Alias normalization & safe territorial reassignment state
  const [targetCampamentoId, setTargetCampamentoId] = useState('');
  const [targetAlmacenId, setTargetAlmacenId] = useState('');
  const [selectedAliases, setSelectedAliases] = useState([]);
  const [customAliases, setCustomAliases] = useState([]);
  const [customAliasInput, setCustomAliasInput] = useState('');
  const [incluirAmbiguos, setIncluirAmbiguos] = useState(true);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [confirmedIndividualIds, setConfirmedIndividualIds] = useState([]);
  const [motivoReasignacion, setMotivoReasignacion] = useState(
    'Homologación territorial de alias histórico hacia sede canónica verificada'
  );
  const [showConfirmBar, setShowConfirmBar] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applySuccess, setApplySuccess] = useState(null);

  const canOperateNormalization = Boolean(
    currentUser?.rol === 'developer' ||
      currentUser?.es_developer === 1 ||
      currentUser?.rol === 'admin' ||
      (typeof hasPermission === 'function' && hasPermission('camp:operar'))
  );

  // Merge kpis.porCampamento + campamentosCatalog so cards show real metrics + canonical aliases
  const catalogById = useMemo(() => {
    const map = new Map();
    if (Array.isArray(campamentosCatalog)) {
      campamentosCatalog.forEach(c => {
        if (c && c.id !== undefined && c.id !== null) {
          map.set(String(c.id), c);
        }
      });
    }
    return map;
  }, [campamentosCatalog]);

  const campamentosConfirmados = useMemo(() => {
    const kpiCamps = Array.isArray(kpis?.porCampamento) ? kpis.porCampamento : [];
    if (kpiCamps.length > 0) {
      return kpiCamps.map(kc => {
        const cat = catalogById.get(String(kc.id)) || {};
        return {
          ...cat,
          ...kc,
          aliases: Array.isArray(cat.aliases) ? cat.aliases : Array.isArray(kc.aliases) ? kc.aliases : [],
          almacenes: Array.isArray(cat.almacenes) ? cat.almacenes : []
        };
      });
    }
    if (!Array.isArray(campamentosCatalog)) return [];
    return campamentosCatalog.filter(
      c =>
        c &&
        !c.es_sintetico &&
        c.activo !== 0 &&
        c.clasificacion_sede !== 'PENDIENTE_VALIDACION' &&
        c.clasificacion_sede !== 'SINTETICO'
    );
  }, [kpis, campamentosCatalog, catalogById]);

  const sinSedeVerificada = kpis?.sinSedeVerificada || null;
  const campamentosPendientes = useMemo(
    () => (Array.isArray(kpis?.campamentosPendientesValidacion) ? kpis.campamentosPendientesValidacion : []),
    [kpis]
  );
  const ubicacionesList = useMemo(
    () => (Array.isArray(kpis?.ubicaciones) ? kpis.ubicaciones : []),
    [kpis]
  );

  // Dynamic totals for summary header (no hardcoded 329 / 104 / 433 / 1971)
  const sumaConfirmados = useMemo(() => {
    if (kpis?.consistenciaMatematica?.sumaArticulosCampamentosConfirmados !== undefined) {
      return Number(kpis.consistenciaMatematica.sumaArticulosCampamentosConfirmados || 0);
    }
    return campamentosConfirmados.reduce((acc, c) => acc + Number(c.total_articulos || 0), 0);
  }, [kpis, campamentosConfirmados]);

  const totalSinSede = Number(
    sinSedeVerificada?.total_articulos ?? kpis?.consistenciaMatematica?.articulosSinSedeVerificada ?? 0
  );

  const totalGeneralArticulos = Number(
    kpis?.consistenciaMatematica?.totalGeneralArticulos ??
      kpis?.totalArticulos ??
      sumaConfirmados + totalSinSede
  );

  const totalUnidadesFisicas = Number(
    kpis?.consistenciaMatematica?.totalUnidadesFisicasConocidas ?? kpis?.cantidadFisicaTotal ?? 0
  );

  const sinSedeDeptEntries = useMemo(() => {
    const porDept = sinSedeVerificada?.por_departamento;
    if (!porDept || typeof porDept !== 'object') return [];
    const entries = Object.entries(porDept).filter(([, val]) => Number(val || 0) > 0);
    return entries.length > 0 ? entries : Object.entries(porDept);
  }, [sinSedeVerificada]);

  // Auto-select initial filter based on activeCampamento or first real campamento/ubicacion
  useEffect(() => {
    if (selectedFilter) return;
    if (activeCampamento?.id) {
      setSelectedFilter({
        mode: 'campamento',
        campamentoId: String(activeCampamento.id),
        ubicacionNombre: activeCampamento.ubicacion_historica_equivalente || activeCampamento.nombre || '',
        label: toSafeDisplayString(activeCampamento.nombre, `Sede #${activeCampamento.id}`)
      });
      return;
    }
    if (campamentosConfirmados.length > 0) {
      const firstCamp = campamentosConfirmados[0];
      setSelectedFilter({
        mode: 'campamento',
        campamentoId: String(firstCamp.id),
        ubicacionNombre: firstCamp.ubicacion_historica_equivalente || firstCamp.nombre || '',
        label: toSafeDisplayString(firstCamp.nombre, `Sede #${firstCamp.id}`)
      });
      return;
    }
    if (ubicacionesList.length > 0) {
      const firstUb = ubicacionesList[0];
      setSelectedFilter({
        mode: 'ubicacion',
        campamentoId: null,
        ubicacionNombre: firstUb.ubicacion_nombre,
        label: toSafeDisplayString(firstUb.ubicacion_nombre, 'Ubicación')
      });
    }
  }, [selectedFilter, activeCampamento, campamentosConfirmados, ubicacionesList]);

  const [fechaRango, setFechaRango] = useState(EMPTY_DATE_RANGE); // v2.2: fecha de registro de los activos listados

  const loadSelectedItems = useCallback(async () => {
    if (!selectedFilter) return;
    setLoading(true);
    try {
      let query = { limit: 100 };
      if (selectedFilter.mode === 'campamento' && selectedFilter.campamentoId) {
        query = { campamento_id: selectedFilter.campamentoId, limit: 100 };
      } else if (selectedFilter.mode === 'sin_sede') {
        query = { campamento_id: 'SIN_SEDE', limit: 100 };
      } else if (selectedFilter.ubicacionNombre) {
        query = { ubicacion: selectedFilter.ubicacionNombre, limit: 100 };
      }
      const res = await fetchArticulos({ ...query, ...dateRangeParams(fechaRango) });
      if (res?.success) {
        setItems(Array.isArray(res.articulos) ? res.articulos : []);
      }
    } catch (err) {
      console.error('Error loading items for selected sede/ubicacion:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedFilter, fetchArticulos, fechaRango]);

  useEffect(() => {
    loadSelectedItems();
  }, [loadSelectedItems]);

  // Active & confirmed campamentos available as canonical destinations
  const destinoCampamentos = useMemo(() => {
    const list = Array.isArray(campamentosCatalog)
      ? campamentosCatalog.filter(c => c && !c.es_sintetico && c.activo !== 0)
      : [];
    const confirmed = list.filter(
      c => c.clasificacion_sede !== 'PENDIENTE_VALIDACION' && c.clasificacion_sede !== 'SINTETICO'
    );
    return confirmed.length > 0 ? confirmed : list;
  }, [campamentosCatalog]);

  const applyTargetCampDefaults = useCallback((campObj) => {
    if (!campObj) return;
    const almacenes = Array.isArray(campObj.almacenes) ? campObj.almacenes : [];
    const principalAlm = almacenes.find(a => a?.es_principal === 1 || a?.es_principal === true) || almacenes[0];
    setTargetAlmacenId(principalAlm?.id ? String(principalAlm.id) : '');

    const historicalVariants = (Array.isArray(campObj.aliases) ? campObj.aliases : [])
      .filter(al => al?.requiere_revision_historica === 1 || al?.requiere_revision_historica === true)
      .map(getAliasLabel)
      .filter(Boolean);
    setSelectedAliases(Array.from(new Set(historicalVariants)));
    setCustomAliases([]);
    setCustomAliasInput('');
  }, []);

  // Initialize target campamento once catalog loads
  useEffect(() => {
    if (targetCampamentoId || destinoCampamentos.length === 0) return;
    const preferred =
      (activeCampamento?.id && destinoCampamentos.find(c => String(c.id) === String(activeCampamento.id))) ||
      destinoCampamentos[0];
    if (preferred) {
      setTargetCampamentoId(String(preferred.id));
      applyTargetCampDefaults(preferred);
    }
  }, [targetCampamentoId, destinoCampamentos, activeCampamento, applyTargetCampDefaults]);

  const selectedTargetCamp = useMemo(
    () => destinoCampamentos.find(c => String(c.id) === String(targetCampamentoId)) || null,
    [destinoCampamentos, targetCampamentoId]
  );

  const targetAlmacenes = useMemo(
    () => (Array.isArray(selectedTargetCamp?.almacenes) ? selectedTargetCamp.almacenes : []),
    [selectedTargetCamp]
  );

  const detectedHistoricalAliases = useMemo(() => {
    if (!selectedTargetCamp || !Array.isArray(selectedTargetCamp.aliases)) return [];
    return selectedTargetCamp.aliases
      .filter(al => al?.requiere_revision_historica === 1 || al?.requiere_revision_historica === true)
      .map(al => ({
        id: al.id ?? getAliasLabel(al),
        label: getAliasLabel(al),
        estado: toSafeDisplayString(al.estado_validacion, 'REVISION_HISTORICA')
      }))
      .filter(al => al.label !== '');
  }, [selectedTargetCamp]);

  const canonicalKnownAliases = useMemo(() => {
    if (!selectedTargetCamp || !Array.isArray(selectedTargetCamp.aliases)) return [];
    return selectedTargetCamp.aliases
      .filter(al => al?.requiere_revision_historica !== 1 && al?.requiere_revision_historica !== true)
      .map(getAliasLabel)
      .filter(Boolean);
  }, [selectedTargetCamp]);

  const handleSelectTargetCampamento = (newId) => {
    setTargetCampamentoId(newId);
    const campObj = destinoCampamentos.find(c => String(c.id) === String(newId));
    applyTargetCampDefaults(campObj);
    setPreviewData(null);
    setPreviewError(null);
    setSelectedCandidateIds([]);
    setConfirmedIndividualIds([]);
    setShowConfirmBar(false);
    setApplyError(null);
    setApplySuccess(null);
  };

  const toggleAliasSelection = (aliasText) => {
    setSelectedAliases(prev =>
      prev.includes(aliasText) ? prev.filter(a => a !== aliasText) : [...prev, aliasText]
    );
  };

  const handleAddCustomAlias = () => {
    const trimmed = customAliasInput.trim();
    if (!trimmed) return;
    if (!customAliases.includes(trimmed) && !detectedHistoricalAliases.some(a => a.label === trimmed)) {
      setCustomAliases(prev => [...prev, trimmed]);
    }
    setSelectedAliases(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomAliasInput('');
  };

  const runPreview = useCallback(async (aliasesList) => {
    if (!selectedTargetCamp) {
      setPreviewError('Selecciona una sede canónica destino válida.');
      return;
    }

    const pendingInput = customAliasInput.trim();
    const combinedAliases = Array.from(
      new Set([
        ...(Array.isArray(aliasesList) ? aliasesList : selectedAliases),
        ...(pendingInput ? [pendingInput] : [])
      ].map(a => String(a).trim()).filter(Boolean))
    );

    if (pendingInput && !customAliases.includes(pendingInput) && !detectedHistoricalAliases.some(a => a.label === pendingInput)) {
      setCustomAliases(prev => [...prev, pendingInput]);
      setSelectedAliases(prev => (prev.includes(pendingInput) ? prev : [...prev, pendingInput]));
      setCustomAliasInput('');
    }

    if (combinedAliases.length === 0) {
      setPreviewError('Selecciona o agrega al menos un alias histórico para previsualizar el impacto.');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setApplyError(null);
    setShowConfirmBar(false);

    try {
      const payload = {
        campamento_destino_id: Number(selectedTargetCamp.id),
        ...(selectedTargetCamp.codigo ? { campamento_destino_codigo: selectedTargetCamp.codigo } : {}),
        ...(targetAlmacenId ? { almacen_destino_id: Number(targetAlmacenId) } : {}),
        aliases: combinedAliases,
        incluir_ambiguos_relacionados: incluirAmbiguos
      };

      const res = await previewReasignacionAlias(payload);
      if (res?.success) {
        setPreviewData(res);
        // Reset explicit article selections and NEVER auto-check individual review confirmations
        setSelectedCandidateIds([]);
        setConfirmedIndividualIds([]);
      } else {
        setPreviewData(null);
        setPreviewError(toSafeDisplayString(res?.message || res?.error, 'No se pudo generar la vista previa.'));
      }
    } catch (err) {
      setPreviewData(null);
      setPreviewError(toSafeDisplayString(err?.message || err, 'Error de comunicación al previsualizar impacto.'));
    } finally {
      setPreviewLoading(false);
    }
  }, [
    selectedTargetCamp,
    customAliasInput,
    selectedAliases,
    customAliases,
    detectedHistoricalAliases,
    targetAlmacenId,
    incluirAmbiguos,
    previewReasignacionAlias
  ]);

  const candidatos = useMemo(
    () => (Array.isArray(previewData?.candidatos) ? previewData.candidatos : []),
    [previewData]
  );

  const normalizedAlerts = useMemo(() => {
    const raw = previewData?.alertas;
    if (!raw) return [];
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === 'object'
        ? Object.entries(raw).flatMap(([groupKey, val]) => {
            if (Array.isArray(val)) {
              return val.map(item =>
                item && typeof item === 'object' ? { ...item, _group: groupKey } : { mensaje: item, _group: groupKey }
              );
            }
            if (val && typeof val === 'object') {
              return [{ ...val, _group: groupKey }];
            }
            return val ? [{ mensaje: val, _group: groupKey }] : [];
          })
        : [{ mensaje: raw }];

    return list.map((al, idx) => {
      if (typeof al === 'string') {
        return { id: `alert-${idx}`, tipo: 'ALERTA', mensaje: al, extras: '', severidad: 'warning' };
      }
      if (!al || typeof al !== 'object') {
        return {
          id: `alert-${idx}`,
          tipo: 'ALERTA',
          mensaje: toSafeDisplayString(al, ''),
          extras: '',
          severidad: 'warning'
        };
      }
      const tipo = toSafeDisplayString(al.tipo || al.codigo || al._group || 'ALERTA', 'ALERTA');
      const mensaje = toSafeDisplayString(
        al.mensaje || al.descripcion || al.detalle || al.titulo || al.texto || al,
        'Alerta detectada en vista previa'
      );
      const extras = [
        al.codigo_original ? `Código: ${toSafeDisplayString(al.codigo_original, '')}` : '',
        al.serie_imei ? `Serie/IMEI: ${toSafeDisplayString(al.serie_imei, '')}` : '',
        al.ubicacion_nombre || al.alias
          ? `Alias/Ubicación: ${toSafeDisplayString(al.ubicacion_nombre || al.alias, '')}`
          : ''
      ]
        .filter(Boolean)
        .join(' · ');
      const lowerTipo = tipo.toLowerCase();
      const severidad = String(
        al.severidad ||
          al.nivel ||
          (lowerTipo.includes('duplic') || lowerTipo.includes('ambigu') || lowerTipo.includes('conflict')
            ? 'high'
            : 'warning')
      ).toLowerCase();
      return { id: `alert-${idx}`, tipo, mensaje, extras, severidad };
    });
  }, [previewData]);

  const toggleCandidateSelection = (artId) => {
    setSelectedCandidateIds(prev =>
      prev.includes(artId) ? prev.filter(id => id !== artId) : [...prev, artId]
    );
    setApplyError(null);
  };

  const toggleIndividualApproval = (artId) => {
    setConfirmedIndividualIds(prev =>
      prev.includes(artId) ? prev.filter(id => id !== artId) : [...prev, artId]
    );
    setApplyError(null);
  };

  const handleSelectAllCandidates = () => {
    const allIds = candidatos.map(getCandidateId).filter(id => id !== null && id !== undefined);
    setSelectedCandidateIds(allIds);
    setApplyError(null);
    // Intentionally NEVER modifies confirmedIndividualIds (must be checked individually!)
  };

  const handleSelectDirectEligibleOnly = () => {
    const directIds = candidatos
      .filter(c => !c?.requiere_confirmacion_individual)
      .map(getCandidateId)
      .filter(id => id !== null && id !== undefined);
    setSelectedCandidateIds(directIds);
    setApplyError(null);
  };

  const handleClearCandidateSelection = () => {
    setSelectedCandidateIds([]);
    setConfirmedIndividualIds([]);
    setShowConfirmBar(false);
    setApplyError(null);
  };

  const selectedCandidates = useMemo(
    () => candidatos.filter(c => selectedCandidateIds.includes(getCandidateId(c))),
    [candidatos, selectedCandidateIds]
  );

  const selectedUnidadesFisicas = useMemo(
    () =>
      selectedCandidates.reduce((sum, c) => {
        const qty = c?.cantidad_num !== null && c?.cantidad_num !== undefined ? Number(c.cantidad_num) : 0;
        return sum + (Number.isFinite(qty) ? qty : 0);
      }, 0),
    [selectedCandidates]
  );

  const selectedPendingIndividualCount = useMemo(
    () =>
      selectedCandidates.filter(c => {
        const id = getCandidateId(c);
        return Boolean(c?.requiere_confirmacion_individual) && !confirmedIndividualIds.includes(id);
      }).length,
    [selectedCandidates, confirmedIndividualIds]
  );

  const approvedIdsToSend = useMemo(
    () =>
      confirmedIndividualIds.filter(id => {
        if (!selectedCandidateIds.includes(id)) return false;
        const cand = candidatos.find(c => getCandidateId(c) === id);
        return Boolean(cand?.requiere_confirmacion_individual);
      }),
    [confirmedIndividualIds, selectedCandidateIds, candidatos]
  );

  const antesSummary = useMemo(() => extractStateSummary(previewData?.antes), [previewData]);
  const despuesSummary = useMemo(() => extractStateSummary(previewData?.despues_simulado), [previewData]);

  const handleExecuteReasignacion = async () => {
    if (!selectedTargetCamp || selectedCandidateIds.length === 0) return;

    setApplying(true);
    setApplyError(null);
    setApplySuccess(null);

    try {
      const payload = {
        campamento_destino_id: Number(selectedTargetCamp.id),
        ...(targetAlmacenId ? { almacen_destino_id: Number(targetAlmacenId) } : {}),
        articulo_ids: selectedCandidateIds,
        confirmar_revision_individual_ids: approvedIdsToSend,
        motivo: motivoReasignacion.trim() || 'Normalización territorial de alias histórico'
      };

      const res = await aplicarReasignacionAlias(payload);
      if (res?.success) {
        setShowConfirmBar(false);
        setApplySuccess({
          reasignados: Number(res.reasignados ?? selectedCandidateIds.length),
          integridad: toSafeDisplayString(
            res.integridad_cantidades,
            'Cantidades y unidades físicas intactas (0 cambios)'
          ),
          destinoNombre: toSafeDisplayString(selectedTargetCamp.nombre, '')
        });
        setSelectedCandidateIds([]);
        setConfirmedIndividualIds([]);

        await Promise.all([
          refreshKpis(),
          refreshCampamentosCatalog(),
          loadSelectedItems(),
          runPreview(selectedAliases)
        ]);
      } else {
        setShowConfirmBar(false);
        setApplyError({
          code: toSafeDisplayString(res?.code, ''),
          message: toSafeDisplayString(
            res?.message || res?.error,
            'No se pudo ejecutar la reasignación transaccional.'
          ),
          bloqueados: Array.isArray(res?.bloqueados) ? res.bloqueados : []
        });
      }
    } catch (err) {
      setShowConfirmBar(false);
      setApplyError({
        code: '',
        message: toSafeDisplayString(err?.message || err, 'Error de comunicación al aplicar reasignación.'),
        bloqueados: []
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <MapPin className="w-5 h-5 text-[#F28524]" />
            <span>Sedes, Campamentos y Ubicaciones Operativas</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Distribución física del inventario de INGMELEC en campamentos centrales, alias reconocidos y zonas operativas en República Dominicana.
          </p>
        </div>
      </div>

      {/* Campamentos Independientes Confirmados + Sin Sede Verificada */}
      {(campamentosConfirmados.length > 0 || sinSedeVerificada) && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Campamentos y Sedes Operativas Confirmadas ({campamentosConfirmados.length}) + Sin Sede Verificada
              </h2>
              <p className="text-xs text-slate-500">
                Conciliación exacta: {sumaConfirmados} artículos en {campamentosConfirmados.length} sedes independientes confirmadas
                {sinSedeVerificada
                  ? ` + ${totalSinSede} artículos en ${toSafeDisplayString(sinSedeVerificada.nombre, 'SIN SEDE VERIFICADA')}${
                      sinSedeVerificada.ubicacion_historica
                        ? ` (${toSafeDisplayString(sinSedeVerificada.ubicacion_historica, '')})`
                        : ''
                    }`
                  : ''}{' '}
                = {totalGeneralArticulos} bienes empresariales.
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
              Total Conciliado: {totalGeneralArticulos} bienes · {totalUnidadesFisicas.toLocaleString('es-DO')} u. físicas
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {campamentosConfirmados.map(camp => {
              const isCardSelected =
                selectedFilter?.mode === 'campamento' &&
                String(selectedFilter.campamentoId) === String(camp.id);
              const aliases = Array.isArray(camp.aliases) ? camp.aliases : [];
              const canonicalAliases = aliases.filter(
                al => al?.requiere_revision_historica !== 1 && al?.requiere_revision_historica !== true
              );
              const historicalPendingAliases = aliases.filter(
                al => al?.requiere_revision_historica === 1 || al?.requiere_revision_historica === true
              );

              return (
                <div
                  key={camp.id}
                  onClick={() =>
                    setSelectedFilter({
                      mode: 'campamento',
                      campamentoId: String(camp.id),
                      ubicacionNombre: camp.ubicacion_historica_equivalente || camp.nombre || '',
                      label: toSafeDisplayString(camp.nombre, `Sede #${camp.id}`)
                    })
                  }
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isCardSelected
                      ? 'border-[#F28524] bg-amber-50/30 ring-2 ring-[#F28524]/30 shadow-sm'
                      : 'border-slate-200/80 bg-slate-50/60 hover:border-[#F28524]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                          {toSafeDisplayString(camp.codigo, `SEDE-${camp.id}`)}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900 mt-1">
                          {toSafeDisplayString(camp.nombre, `Sede #${camp.id}`)}
                        </h3>
                        {camp.ubicacion_historica_equivalente && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            Excel: {toSafeDisplayString(camp.ubicacion_historica_equivalente, '')}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                        Confirmado
                      </span>
                    </div>

                    {/* Alias canónicos reconocidos */}
                    <div className="pt-1.5 border-t border-slate-200/60">
                      <div className="text-[10px] font-semibold text-slate-500 flex items-center space-x-1 mb-1">
                        <Tag className="w-3 h-3 text-[#F28524]" />
                        <span>Alias canónicos reconocidos:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {canonicalAliases.length > 0 ? (
                          canonicalAliases.map((al, idx) => (
                            <span
                              key={al.id ?? `${camp.id}-canon-${idx}`}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white text-slate-700 border border-slate-200"
                              title={toSafeDisplayString(al.estado_validacion, 'Canónico')}
                            >
                              {getAliasLabel(al)}
                            </span>
                          ))
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white text-slate-600 border border-slate-200">
                            {toSafeDisplayString(camp.codigo || camp.nombre, 'Canónico')}
                          </span>
                        )}
                        {historicalPendingAliases.map((al, idx) => (
                          <span
                            key={al.id ?? `${camp.id}-rev-${idx}`}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200"
                            title="Variante histórica que requiere revisión"
                          >
                            {getAliasLabel(al)} · rev.
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-600">
                    <div>
                      <span className="block text-[10px] text-slate-400">Almacenes</span>
                      <strong className="text-slate-800">
                        {Number(camp.cantidad_almacenes ?? camp.almacenes?.length ?? 0)}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">Artículos</span>
                      <strong className="text-blue-700">{Number(camp.total_articulos || 0)}</strong>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">Unid. Fís.</span>
                      <strong className="text-slate-800">
                        {Number(camp.total_fisico || 0).toLocaleString('es-DO')}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}

            {sinSedeVerificada && (
              <div
                onClick={() =>
                  setSelectedFilter({
                    mode: 'sin_sede',
                    campamentoId: 'SIN_SEDE',
                    ubicacionNombre: sinSedeVerificada.ubicacion_historica || '',
                    label: toSafeDisplayString(sinSedeVerificada.nombre, 'SIN SEDE VERIFICADA')
                  })
                }
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  selectedFilter?.mode === 'sin_sede'
                    ? 'border-amber-500 bg-amber-100/70 ring-2 ring-amber-400/50 shadow-sm'
                    : 'border-amber-300 bg-amber-50/60 hover:border-amber-500'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                        PEND-SEDE
                      </span>
                      <h3 className="font-bold text-sm text-amber-950 mt-1">
                        {toSafeDisplayString(sinSedeVerificada.nombre, 'SIN SEDE VERIFICADA')}
                      </h3>
                      <div className="text-[10px] text-amber-800 font-mono">
                        Excel: {toSafeDisplayString(sinSedeVerificada.ubicacion_historica, 'Sin ubicación histórica')}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                      Por Clasificar
                    </span>
                  </div>

                  {/* Desglose dinámico por departamento */}
                  <div className="pt-1.5 border-t border-amber-200/80">
                    <div className="text-[10px] font-semibold text-amber-800 mb-1">
                      Desglose por departamento:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sinSedeDeptEntries.length > 0 ? (
                        sinSedeDeptEntries.map(([deptKey, deptCount]) => (
                          <span
                            key={deptKey}
                            className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-bold"
                          >
                            {formatDeptShort(deptKey)}: {Number(deptCount || 0)}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-amber-800">Sin desglose disponible</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-200 text-[11px] text-amber-900">
                  <div>
                    <span className="block text-[10px] text-amber-700">Artículos</span>
                    <strong className="text-amber-950">{Number(sinSedeVerificada.total_articulos || 0)}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-amber-700">Unid. Fís.</span>
                    <strong className="text-amber-950">
                      {Number(sinSedeVerificada.total_fisico || 0).toLocaleString('es-DO')}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {campamentosPendientes.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between gap-2">
              <div>
                <strong className="text-slate-800">
                  Campamentos en catálogo pendientes de validación ({campamentosPendientes.length}):
                </strong>{' '}
                {campamentosPendientes.map(c => toSafeDisplayString(c.nombre, '')).filter(Boolean).join(', ')} (sin registros en el corte actual).
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-200 text-slate-700 rounded whitespace-nowrap">
                PENDIENTE_VALIDACION
              </span>
            </div>
          )}
        </div>
      )}

      {/* Panel: Normalización de Alias y Reasignación Territorial Segura */}
      {canOperateNormalization && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="bg-slate-900 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-[#F28524]" />
                <h2 className="font-bold text-base">
                  Normalización de Alias y Reasignación Territorial Segura
                </h2>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Simula y ejecuta reasignaciones desde alias históricos hacia una sede canónica confirmada conservando cantidades intactas y revisión individual obligatoria ante duplicados o ambigüedades.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#F28524]/20 border border-[#F28524]/40 text-[#F28524] text-[11px] font-bold whitespace-nowrap self-start sm:self-auto">
              0 Fusiones · Transaccional MySQL
            </span>
          </div>

          <div className="p-5 space-y-5">
            {/* Step 1: Target Sede + Almacén + Aliases */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Sede canónica destino */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  1. Sede Canónica Destino
                </label>
                <select
                  value={targetCampamentoId}
                  onChange={e => handleSelectTargetCampamento(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                >
                  {destinoCampamentos.length === 0 && (
                    <option value="">Cargando sedes confirmadas...</option>
                  )}
                  {destinoCampamentos.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {toSafeDisplayString(c.nombre, `Sede #${c.id}`)}
                      {c.codigo ? ` (${toSafeDisplayString(c.codigo, '')})` : ''}
                    </option>
                  ))}
                </select>
                {canonicalKnownAliases.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Canónicos homologados: <span className="font-mono text-slate-700">{canonicalKnownAliases.join(', ')}</span>
                  </p>
                )}
              </div>

              {/* Almacén destino */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  2. Almacén Destino en Sede
                </label>
                <select
                  value={targetAlmacenId}
                  onChange={e => {
                    setTargetAlmacenId(e.target.value);
                    setPreviewData(null);
                  }}
                  disabled={targetAlmacenes.length === 0}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#F28524] disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {targetAlmacenes.length > 0 ? 'Automático / Sin almacén específico' : 'Sin almacenes registrados en sede'}
                  </option>
                  {targetAlmacenes.map(alm => (
                    <option key={alm.id} value={String(alm.id)}>
                      {toSafeDisplayString(alm.nombre, `Almacén #${alm.id}`)}
                      {alm.es_principal ? ' (Principal)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ingreso opcional de alias adicional */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  3. Agregar Alias Adicional (Opcional)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={customAliasInput}
                    onChange={e => setCustomAliasInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomAlias();
                      }
                    }}
                    placeholder="Ej. Alias histórico de sede o bodega..."
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomAlias}
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center space-x-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Variantes alias detectadas (requiere_revision_historica === 1) + custom */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800">
                  Variantes Alias Detectadas para Revisión Histórica
                </div>
                <label className="inline-flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={incluirAmbiguos}
                    onChange={e => setIncluirAmbiguos(e.target.checked)}
                    className="rounded border-slate-300 text-[#F28524] focus:ring-[#F28524]"
                  />
                  <span>Incluir casos ambiguos relacionados para auditoría</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                {detectedHistoricalAliases.map(al => {
                  const checked = selectedAliases.includes(al.label);
                  return (
                    <label
                      key={al.id}
                      className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                        checked
                          ? 'bg-[#F28524]/10 border-[#F28524] text-slate-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAliasSelection(al.label)}
                        className="rounded border-slate-300 text-[#F28524] focus:ring-[#F28524]"
                      />
                      <span className="font-mono">{al.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                        {al.estado}
                      </span>
                    </label>
                  );
                })}

                {customAliases.map(aliasText => {
                  const checked = selectedAliases.includes(aliasText);
                  return (
                    <div
                      key={`custom-${aliasText}`}
                      className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                        checked
                          ? 'bg-[#F28524]/10 border-[#F28524] text-slate-900'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <label className="inline-flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAliasSelection(aliasText)}
                          className="rounded border-slate-300 text-[#F28524] focus:ring-[#F28524]"
                        />
                        <span className="font-mono">{aliasText}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomAliases(prev => prev.filter(a => a !== aliasText));
                          setSelectedAliases(prev => prev.filter(a => a !== aliasText));
                        }}
                        className="text-slate-400 hover:text-rose-600 ml-1"
                        title="Quitar alias manual"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {detectedHistoricalAliases.length === 0 && customAliases.length === 0 && (
                  <p className="text-xs text-slate-500 italic">
                    Esta sede no tiene variantes pendientes con revisión histórica registradas; puedes agregar un alias manual arriba para simular su impacto.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
                <div className="text-[11px] text-slate-500">
                  Alias seleccionados para simular: <strong>{selectedAliases.length}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => runPreview(selectedAliases)}
                  disabled={previewLoading || !selectedTargetCamp}
                  className="px-4 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl text-xs font-bold shadow-md shadow-[#F28524]/20 flex items-center space-x-2 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
                  <span>{previewLoading ? 'Calculando Vista Previa...' : 'Previsualizar Impacto'}</span>
                </button>
              </div>
            </div>

            {previewError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span>{toSafeDisplayString(previewError, 'Error al calcular vista previa.')}</span>
              </div>
            )}

            {applySuccess && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex items-start justify-between gap-3">
                <div className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm text-emerald-900">
                      Reasignación transaccional aplicada a {applySuccess.destinoNombre}
                    </div>
                    <div className="mt-0.5">
                      Artículos reasignados: <strong>{applySuccess.reasignados}</strong> · Integridad de cantidades:{' '}
                      <strong>{applySuccess.integridad}</strong>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setApplySuccess(null)}
                  className="text-emerald-700 hover:text-emerald-950"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 2: Vista Previa Result */}
            {previewData && (
              <div className="space-y-4 pt-2 border-t border-slate-200">
                {/* Antes vs Después Simulado */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Antes (Estado Actual)
                    </div>
                    <div className="text-xs text-slate-700">
                      Sede destino:{' '}
                      <strong className="text-slate-900">
                        {antesSummary.destinoArticulos !== null ? `${antesSummary.destinoArticulos} art.` : '—'}
                      </strong>{' '}
                      ·{' '}
                      <strong>
                        {antesSummary.destinoFisico !== null
                          ? `${antesSummary.destinoFisico.toLocaleString('es-DO')} u.`
                          : '—'}
                      </strong>
                    </div>
                    {antesSummary.sinSedeArticulos !== null && (
                      <div className="text-[11px] text-amber-800">
                        Sin sede verificada: <strong>{antesSummary.sinSedeArticulos} art.</strong>
                        {antesSummary.sinSedeFisico !== null
                          ? ` (${antesSummary.sinSedeFisico.toLocaleString('es-DO')} u.)`
                          : ''}
                      </div>
                    )}
                    {antesSummary.globalArticulos !== null && (
                      <div className="text-[11px] text-slate-500">
                        Total global: <strong>{antesSummary.globalArticulos} art.</strong>
                        {antesSummary.globalFisico !== null
                          ? ` · ${antesSummary.globalFisico.toLocaleString('es-DO')} u.`
                          : ''}
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                      Después Simulado (Si Aplicas Candidatos)
                    </div>
                    <div className="text-xs text-emerald-950">
                      Sede destino:{' '}
                      <strong>
                        {despuesSummary.destinoArticulos !== null ? `${despuesSummary.destinoArticulos} art.` : '—'}
                      </strong>{' '}
                      ·{' '}
                      <strong>
                        {despuesSummary.destinoFisico !== null
                          ? `${despuesSummary.destinoFisico.toLocaleString('es-DO')} u.`
                          : '—'}
                      </strong>
                    </div>
                    {despuesSummary.sinSedeArticulos !== null && (
                      <div className="text-[11px] text-emerald-900">
                        Sin sede restante: <strong>{despuesSummary.sinSedeArticulos} art.</strong>
                        {despuesSummary.sinSedeFisico !== null
                          ? ` (${despuesSummary.sinSedeFisico.toLocaleString('es-DO')} u.)`
                          : ''}
                      </div>
                    )}
                    {despuesSummary.globalArticulos !== null && (
                      <div className="text-[11px] text-emerald-800">
                        Total global intacto: <strong>{despuesSummary.globalArticulos} art.</strong>
                        {despuesSummary.globalFisico !== null
                          ? ` · ${despuesSummary.globalFisico.toLocaleString('es-DO')} u.`
                          : ''}
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 text-white space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#F28524] flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Integridad de Inventario</span>
                    </div>
                    <div className="text-xs text-slate-200">
                      Fusiones de registros:{' '}
                      <strong className="text-emerald-400">
                        {Number(previewData?.resumen?.impacto_fusiones_articulos ?? previewData?.resumen?.fusiones ?? 0)}
                      </strong>{' '}
                      · Cambios de cantidad:{' '}
                      <strong className="text-emerald-400">
                        {Number(previewData?.resumen?.impacto_cantidades_alteradas ?? previewData?.resumen?.cambios_cantidad ?? 0)}
                      </strong>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      Candidatos detectados: <strong>{candidatos.length}</strong> · Seleccionados ahora:{' '}
                      <strong className="text-[#F28524]">{selectedCandidateIds.length}</strong> ({selectedUnidadesFisicas.toLocaleString('es-DO')} u. físicas intactas)
                    </div>
                  </div>
                </div>

                {/* Alertas destacadas para duplicados y casos ambiguos */}
                {normalizedAlerts.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-rose-900 flex items-center space-x-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span>Alertas de Duplicados y Casos Ambiguos ({normalizedAlerts.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {normalizedAlerts.map(al => (
                        <div
                          key={al.id}
                          className={`p-3 rounded-xl border text-xs flex items-start space-x-2.5 ${
                            al.severidad === 'high' || al.severidad === 'critical' || al.severidad === 'error'
                              ? 'bg-rose-50 border-rose-300 text-rose-950'
                              : 'bg-amber-50 border-amber-300 text-amber-950'
                          }`}
                        >
                          <AlertTriangle
                            className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                              al.severidad === 'high' || al.severidad === 'critical' || al.severidad === 'error'
                                ? 'text-rose-600'
                                : 'text-amber-600'
                            }`}
                          />
                          <div className="space-y-0.5 min-w-0">
                            <span className="inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/80 border border-current/20">
                              {al.tipo}
                            </span>
                            <div className="font-semibold">{al.mensaje}</div>
                            {al.extras && <div className="text-[11px] font-mono opacity-85">{al.extras}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabla de Candidatos */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-800">
                      Candidatos a Reasignación ({candidatos.length}) · Seleccionados: {selectedCandidateIds.length}
                    </div>
                    {candidatos.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectDirectEligibleOnly}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700"
                        >
                          Solo elegibles directos
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAllCandidates}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700"
                        >
                          Seleccionar todos
                        </button>
                        <button
                          type="button"
                          onClick={handleClearCandidateSelection}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-600"
                        >
                          Limpiar selección
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3 text-center">Sel.</th>
                          <th className="py-2.5 px-3">Código / Serial</th>
                          <th className="py-2.5 px-3">Artículo / Área</th>
                          <th className="py-2.5 px-3">Ubicación Histórica / Sede Actual</th>
                          <th className="py-2.5 px-3 text-center">Cant. Física</th>
                          <th className="py-2.5 px-3">Validación y Revisión Individual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {candidatos.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="py-10 text-center text-slate-400">
                              No se encontraron artículos candidatos para los alias seleccionados.
                            </td>
                          </tr>
                        ) : (
                          candidatos.map((cand, idx) => {
                            const artId = getCandidateId(cand);
                            const isSelected = selectedCandidateIds.includes(artId);
                            const requiresIndividual = Boolean(cand?.requiere_confirmacion_individual);
                            const isIndividualApproved = confirmedIndividualIds.includes(artId);
                            const reasonText = getCandidateReasonText(cand);

                            return (
                              <tr
                                key={artId ?? `cand-${idx}`}
                                className={`transition-colors ${
                                  requiresIndividual
                                    ? 'bg-amber-50/40 hover:bg-amber-50/80'
                                    : isSelected
                                      ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                                      : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2.5 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleCandidateSelection(artId)}
                                    disabled={artId === null || artId === undefined}
                                    className="rounded border-slate-300 text-[#F28524] focus:ring-[#F28524]"
                                    aria-label={`Seleccionar artículo ${toSafeDisplayString(cand.codigo_original || artId, '')}`}
                                  />
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="font-mono font-bold text-slate-900">
                                    {toSafeDisplayString(cand.codigo_original, `#${toSafeDisplayString(artId, '—')}`)}
                                  </div>
                                  {cand.serie_imei && (
                                    <div className="font-mono text-[10px] text-slate-500">
                                      S/N: {toSafeDisplayString(cand.serie_imei, '')}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-slate-800">
                                    {toSafeDisplayString(cand.articulo_nombre, 'Sin descripción')}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {toSafeDisplayString(cand.area, '—')}
                                    {cand.marca_modelo ? ` · ${toSafeDisplayString(cand.marca_modelo, '')}` : ''}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-mono text-[11px] text-slate-800">
                                    {toSafeDisplayString(cand.ubicacion_nombre, 'Sin ubicación')}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {cand.campamento_id
                                      ? `Sede actual: ${toSafeDisplayString(cand.campamento_nombre || cand.campamento_actual_nombre, `#${cand.campamento_id}`)}`
                                      : 'SIN SEDE VERIFICADA'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap font-bold text-slate-900">
                                  {cand.cantidad_num !== null && cand.cantidad_num !== undefined
                                    ? `${Number(cand.cantidad_num)} ${toSafeDisplayString(cand.unidad_medida, 'Unidad')}`
                                    : toSafeDisplayString(cand.cantidad_texto, 'Pend. verificación')}
                                </td>
                                <td className="py-2.5 px-3">
                                  {requiresIndividual ? (
                                    <div className="space-y-1.5">
                                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-bold">
                                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                                        <span>Requiere revisión física individual</span>
                                      </span>
                                      {reasonText && (
                                        <div className="text-[11px] text-amber-900">{reasonText}</div>
                                      )}
                                      <label className="inline-flex items-center space-x-1.5 cursor-pointer bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-50">
                                        <input
                                          type="checkbox"
                                          checked={isIndividualApproved}
                                          onChange={() => toggleIndividualApproval(artId)}
                                          className="rounded border-amber-400 text-[#F28524] focus:ring-[#F28524]"
                                        />
                                        <span>Apruebo revisión física individual</span>
                                      </label>
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Elegible directo</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Error 409 / Bloqueados */}
                {applyError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-950 space-y-2">
                    <div className="flex items-start space-x-2">
                      <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-sm text-rose-900">
                          {applyError.message}
                          {applyError.code ? (
                            <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-rose-200 text-rose-950">
                              {applyError.code}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {applyError.bloqueados.length > 0 && (
                      <div className="pl-7 space-y-1">
                        <div className="font-semibold text-rose-900">
                          Artículos bloqueados que requieren marcar "Apruebo revisión física individual":
                        </div>
                        <ul className="list-disc pl-4 space-y-1 text-[11px]">
                          {applyError.bloqueados.map((bloq, idx) => {
                            if (!bloq || typeof bloq !== 'object') {
                              return <li key={`bloq-${idx}`}>{toSafeDisplayString(bloq, 'Artículo bloqueado')}</li>;
                            }
                            const bId = toSafeDisplayString(bloq.id ?? bloq.articulo_id, '');
                            const bCode = toSafeDisplayString(bloq.codigo_original, 'Sin código');
                            const bName = toSafeDisplayString(bloq.articulo_nombre, '');
                            const bMotivo = Array.isArray(bloq.motivos_bloqueo) && bloq.motivos_bloqueo.length > 0
                              ? bloq.motivos_bloqueo.map(m => toSafeDisplayString(m, '')).filter(Boolean).join(' · ')
                              : toSafeDisplayString(
                                  bloq.motivos_bloqueo || bloq.motivo || bloq.razon || bloq.detalle || bloq.mensaje,
                                  'Requiere confirmación explícita de revisión individual'
                                );
                            return (
                              <li key={`bloq-${bId || idx}`}>
                                <strong className="font-mono">{bCode}</strong>
                                {bId ? ` (#${bId})` : ''}
                                {bName ? ` · ${bName}` : ''} — {bMotivo}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Motivo & Confirmation Action Bar */}
                {candidatos.length > 0 && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-end">
                      <div className="lg:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Motivo de Auditoría / Reasignación Territorial
                        </label>
                        <input
                          type="text"
                          value={motivoReasignacion}
                          onChange={e => setMotivoReasignacion(e.target.value)}
                          placeholder="Justificación operativa para la bitácora de auditoría..."
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={selectedCandidateIds.length === 0 || applying}
                          onClick={() => {
                            setApplyError(null);
                            setShowConfirmBar(true);
                          }}
                          className="w-full lg:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-40 flex items-center justify-center space-x-2"
                        >
                          <ShieldCheck className="w-4 h-4 text-[#F28524]" />
                          <span>Confirmar Reasignación Transaccional</span>
                        </button>
                      </div>
                    </div>

                    {selectedCandidateIds.length === 0 && (
                      <div className="text-[11px] text-slate-500">
                        Marca al menos 1 artículo en la tabla de candidatos para habilitar la reasignación transaccional.
                      </div>
                    )}

                    {/* Explicit in-UI Confirmation Step (replaces fragile window.confirm) */}
                    {showConfirmBar && (
                      <div className="p-4 rounded-xl bg-slate-900 text-white border-2 border-[#F28524] space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-black text-[#F28524]">
                              Confirmación Transaccional Requerida
                            </div>
                            <p className="text-xs text-slate-200 mt-1">
                              Vas a reasignar <strong>{selectedCandidateIds.length} artículo(s)</strong> ({selectedUnidadesFisicas.toLocaleString('es-DO')} unidades físicas intactas) hacia la sede canónica{' '}
                              <strong>
                                {toSafeDisplayString(selectedTargetCamp?.nombre, '')}
                                {selectedTargetCamp?.codigo ? ` (${toSafeDisplayString(selectedTargetCamp.codigo, '')})` : ''}
                              </strong>
                              .
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowConfirmBar(false)}
                            disabled={applying}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {selectedPendingIndividualCount > 0 && (
                          <div className="p-2.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-xs text-amber-200">
                            Atención: {selectedPendingIndividualCount} artículo(s) seleccionados tienen marca{' '}
                            <strong>requiere_confirmacion_individual</strong> sin aprobación marcada. El servidor bloqueará la transacción (409) hasta aprobarlos individualmente.
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowConfirmBar(false)}
                            disabled={applying}
                            className="px-3.5 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-800 text-xs font-semibold"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleExecuteReasignacion}
                            disabled={applying}
                            className="px-4 py-2 rounded-xl bg-[#F28524] hover:bg-[#d87019] text-white text-xs font-bold flex items-center space-x-2 disabled:opacity-50"
                          >
                            {applying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                            <span>{applying ? 'Aplicando en MySQL...' : 'Sí, Ejecutar Reasignación en MySQL'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ubicaciones Cards (Ubicaciones Históricas en Inventario) */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">
          Ubicaciones Históricas Registradas en Inventario (Sin Reasignación Automática)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ubicacionesList.map((ub, idx) => {
            const ubName = toSafeDisplayString(ub.ubicacion_nombre, 'Sin ubicación');
            const isSelected =
              selectedFilter?.mode === 'ubicacion' && selectedFilter.ubicacionNombre === ub.ubicacion_nombre;
            return (
              <div
                key={ub.ubicacion_nombre || idx}
                onClick={() =>
                  setSelectedFilter({
                    mode: 'ubicacion',
                    campamentoId: null,
                    ubicacionNombre: ub.ubicacion_nombre,
                    label: ubName
                  })
                }
                className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-[#F28524]'
                    : 'bg-white text-slate-800 border-slate-200/80 hover:border-slate-300 hover:shadow'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-xl ${isSelected ? 'bg-[#F28524] text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <Building className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {Number(ub.count || 0)} bienes
                  </span>
                </div>
                <h3 className="font-bold text-sm tracking-tight line-clamp-2">{ubName}</h3>
                <p className={`text-[11px] mt-2 flex items-center ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                  <span>Consultar inventario</span>
                  <ArrowRight className="w-3 h-3 ml-1" />
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inventory List in Selected Location */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-800">
              Inventario Activo en:{' '}
              <span className="text-[#F28524]">
                {toSafeDisplayString(selectedFilter?.label || selectedFilter?.ubicacionNombre, 'Selecciona una sede o ubicación')}
              </span>
            </h3>
            <span className="text-xs text-slate-400">{items.length} activos listados</span>
          </div>
          <DateRangeFilter
            value={fechaRango}
            onChange={setFechaRango}
            label="Filtrar activos por fecha de registro"
            hint="Aplica a los activos de la sede o ubicación seleccionada (fecha de registro en el sistema)."
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold uppercase">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Área</th>
                <th className="py-3 px-4">Artículo</th>
                <th className="py-3 px-4">Marca / Serie</th>
                <th className="py-3 px-4 text-center">Cantidad</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Custodio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    Cargando bienes de la sede...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    No hay artículos registrados para esta ubicación.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {toSafeDisplayString(item.codigo_original, '—')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {toSafeDisplayString(item.area, '—')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {toSafeDisplayString(item.articulo_nombre, 'Sin descripción')}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{toSafeDisplayString(item.marca_modelo, 'Genérico')}</div>
                      {item.serie_imei && (
                        <div className="font-mono text-[10px] text-slate-400">
                          S/N: {toSafeDisplayString(item.serie_imei, '')}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900">
                      {item.cantidad_num !== null && item.cantidad_num !== undefined
                        ? Number(item.cantidad_num)
                        : toSafeDisplayString(item.cantidad_texto, 'Pend.')}{' '}
                      {toSafeDisplayString(item.unidad_medida, 'Unidad')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.estado_fisico === 'Bueno'
                            ? 'bg-emerald-50 text-emerald-700'
                            : item.estado_fisico === 'Regular'
                              ? 'bg-amber-50 text-amber-700'
                              : item.estado_fisico === 'Dañado'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {toSafeDisplayString(item.estado_fisico, 'Pendiente')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {toSafeDisplayString(item.asignado_a, 'Sin asignar')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
