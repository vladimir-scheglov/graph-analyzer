import type {
  ModelIndex,
  EntityRecord,
  AttributeRecord
} from '../../shared/model-types';
import type {
  PiiCategory,
  PiiHit,
  PiiReport,
  PiiSeverity
} from '../../shared/pii-types';

// ============ Словари ============

interface Rule {
  /** Что искать в `id + ' ' + name`. */
  pattern: RegExp;
  category: PiiCategory;
  severity: PiiSeverity;
  reason: string;
  regulation?: string;
  note: string;
}

// ============ Unicode-aware word boundary ============
// Стандартный \b в JS работает только для ASCII: [A-Za-z0-9_].
// Кириллица (а также любые другие \p{L}) не считается word-символом,
// поэтому \bпаспорт\b никогда не срабатывает. Используем lookaround
// на \p{L}\p{N}_ с флагом u.
function U(src: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`,
    "iu",
  );
}

const RULES: Rule[] = [
  // ============ SPECIAL — спецкатегории ============
  {
    pattern: U("passport|паспорт|passportnumber|passportno"),
    category: "document",
    severity: "critical",
    reason: "документ, удостоверяющий личность",
    regulation: "GDPR Art. 9 / 152-ФЗ",
    note: "Спецкатегория ПДн — требует повышенной защиты",
  },
  {
    pattern: U("ssn|socialsecurity|nationalid|nationalnumber"),
    category: "document",
    severity: "critical",
    reason: "национальный идентификационный номер",
    regulation: "GDPR Art. 9 / 152-ФЗ",
    note: "Спецкатегория ПДн",
  },
  {
    pattern: U("inn|инн|snils|снилс|ogrn|огрн|kpp|кпп"),
    category: "document",
    severity: "critical",
    reason: "российский идентификатор",
    regulation: "152-ФЗ",
    note: "Регуляторно значимый идентификатор",
  },
  {
    pattern: U("driverlicense|driverlicence|licence|водительское"),
    category: "document",
    severity: "high",
    reason: "водительское удостоверение",
    regulation: "152-ФЗ",
    note: "Персональный документ",
  },
  {
    // "др" отдельно не выделяем — слишком много ложных.
    // Ловим только "birth..." и "дата рождения" в любых разделителях.
    pattern: U("birthdate|dateofbirth|birthday|дата[ _\\-]?рождения"),
    category: "identity",
    severity: "high",
    reason: "дата рождения",
    regulation: "GDPR Art. 4 / 152-ФЗ",
    note: "Персональные данные + квази-идентификатор",
  },
  {
    pattern: U("religion|религия|вероисповедание"),
    category: "special",
    severity: "critical",
    reason: "религиозные убеждения",
    regulation: "GDPR Art. 9 / 152-ФЗ спецкатегория",
    note: "Спецкатегория — нельзя обрабатывать без явного согласия",
  },
  {
    pattern: U("ethnicity|ethnic|национальность|раса|race"),
    category: "special",
    severity: "critical",
    reason: "этническая принадлежность",
    regulation: "GDPR Art. 9",
    note: "Спецкатегория",
  },
  {
    pattern: U("politicalview|political|политическ"),
    category: "special",
    severity: "critical",
    reason: "политические убеждения",
    regulation: "GDPR Art. 9",
    note: "Спецкатегория",
  },
  {
    pattern: U("health|medical|diagnosis|диагноз|здоровь|болезн|медицин"),
    category: "special",
    severity: "critical",
    reason: "данные о здоровье",
    regulation: "GDPR Art. 9 / 152-ФЗ спецкатегория",
    note: "Медицинская тайна",
  },
  {
    pattern: U(
      "biometric|fingerprint|retina|faceid|voiceprint|отпечат|биометр",
    ),
    category: "biometric",
    severity: "critical",
    reason: "биометрические данные",
    regulation: "GDPR Art. 9 / 152-ФЗ",
    note: "Биометрия — спецкатегория, требует отдельного согласия",
  },
  {
    pattern: U("sexual|orientation|сексуальн"),
    category: "special",
    severity: "critical",
    reason: "сексуальная ориентация",
    regulation: "GDPR Art. 9",
    note: "Спецкатегория",
  },

  // ============ FINANCIAL ============
  {
    // "pan" — слишком короткое, ловит "panel", "companion".
    // Оставляем только pan в контексте "card"/"cc" не делаем — оставляем как есть,
    // но добавим явный "cardpan".
    pattern: U(
      "cardnumber|cardno|cardpan|creditcard|debitcard|карта[ _\\-]?номер",
    ),
    category: "financial",
    severity: "critical",
    reason: "номер банковской карты",
    regulation: "PCI DSS",
    note: "Запрещено хранить в открытом виде",
  },
  {
    pattern: U("cvv|cvc|cvv2|cvc2"),
    category: "financial",
    severity: "critical",
    reason: "CVV/CVC код карты",
    regulation: "PCI DSS",
    note: "Запрещено хранить вообще",
  },
  {
    pattern: U(
      "iban|swift|bic|bankaccount|bankaccountnumber|расчетн\\w*[ _\\-]?счет|р\\/с",
    ),
    category: "financial",
    severity: "critical",
    reason: "банковские реквизиты",
    regulation: "152-ФЗ / PCI DSS",
    note: "Финансовая информация",
  },

  // ============ IDENTITY / CONTACT ============
  {
    pattern: U(
      "firstname|lastname|middlename|surname|givenname|patronymic|fullname|имя|фамилия|отчество",
    ),
    category: "identity",
    severity: "high",
    reason: "ФИО",
    regulation: "GDPR Art. 4 / 152-ФЗ",
    note: "Персональные данные",
  },
  {
    // "e?mail" ловит "mail" и "email", но не "e-mail". Добавляем явный вариант.
    pattern: U("e[-_]?mail|emailaddress|почта|электронн"),
    category: "contact",
    severity: "high",
    reason: "email",
    regulation: "GDPR Art. 4 / 152-ФЗ",
    note: "Контактные данные",
  },
  {
    pattern: U(
      "phone|mobile|mobilephone|telephone|tel|phoneNumber|телефон|мобильн",
    ),
    category: "contact",
    severity: "high",
    reason: "телефон",
    regulation: "GDPR Art. 4 / 152-ФЗ",
    note: "Контактные данные",
  },
  {
    pattern: U(
      "address|postaladdress|streetaddress|homeaddress|адрес|улица|дом",
    ),
    category: "contact",
    severity: "high",
    reason: "почтовый адрес",
    regulation: "GDPR Art. 4 / 152-ФЗ",
    note: "Контактные данные",
  },

  // ============ LOCATION ============
  {
    pattern: U("geolocation|location|coordinates|координат|местополож"),
    category: "location",
    severity: "high",
    reason: "геолокация",
    regulation: "GDPR Art. 4",
    note: "Квази-идентификатор, особо чувствительно",
  },
  {
    pattern: U("city|город|region|регион|country|страна|zip|postcode|индекс"),
    category: "location",
    severity: "medium",
    reason: "географические данные",
    note: "Квази-идентификатор в комбинации",
  },

  // ============ TECHNICAL ============
  {
    pattern: U("ipaddress|ipaddr|ip|ipv4|ipv6|host|хост"),
    category: "technical",
    severity: "medium",
    reason: "IP-адрес",
    regulation: "GDPR (Recital 30)",
    note: "PII в контексте персональных сущностей",
  },
  {
    pattern: U("deviceid|deviceidentifier|macaddress|imei|mac"),
    category: "technical",
    severity: "medium",
    reason: "идентификатор устройства",
    regulation: "GDPR",
    note: "Квази-идентификатор",
  },
  {
    pattern: U("cookie|cookies|trackingid|useragent"),
    category: "technical",
    severity: "medium",
    reason: "трекер",
    regulation: "GDPR / ePrivacy",
    note: "Требует согласия на cookie",
  },
  {
    pattern: U("userid|user_id|accountid|customerid|clientid|personid"),
    category: "technical",
    severity: "low",
    reason: "внутренний идентификатор",
    note: "PII в связке с другими данными",
  },
];

// ============ Контекст сущности ============

const PERSON_ENTITY_PATTERN = /\b(user|person|people|employee|candidate|client|customer|contact|patient|student|account|profile|member|staff|operator|admin|manager|citizen|individual|субъект|сотрудник|клиент|пользователь|физическ)\b/i;

function isPersonContext(entity: EntityRecord): boolean {
  if (PERSON_ENTITY_PATTERN.test(entity.entityId)) return true;
  if (PERSON_ENTITY_PATTERN.test(entity.name || '')) return true;
  return false;
}

// ============ Проверка атрибута ============

function matchRules(a: AttributeRecord): Rule[] {
  const hay = (a.id + ' ' + (a.name || '')).toLowerCase();
  const hits: Rule[] = [];
  for (const r of RULES) {
    if (r.pattern.test(hay)) hits.push(r);
  }
  return hits;
}

const SEVERITY_ORDER: Record<PiiSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

// ============ Главная функция ============

export function detectPii(index: ModelIndex): PiiReport {
  const hits: PiiHit[] = [];

  for (const entity of index.entities) {
    const isPerson = isPersonContext(entity);
    for (const a of entity.attributes) {
      const matched = matchRules(a);
      if (matched.length === 0) continue;

      // Выбираем самое критичное правило
      matched.sort((x, y) => SEVERITY_ORDER[y.severity] - SEVERITY_ORDER[x.severity]);
      const top = matched[0];

      // Не-персональные сущности: снижаем серьёзность на один уровень
      // для категорий identity/contact/location, чтобы не ловить «Product.name».
      let severity = top.severity;
      if (!isPerson && top.category !== 'special' && top.category !== 'biometric' && top.category !== 'financial' && top.category !== 'document') {
        const downgrade: Record<PiiSeverity, PiiSeverity> = {
          critical: 'high',
          high: 'medium',
          medium: 'low',
          low: 'low'
        };
        severity = downgrade[severity];
      }

      // Если атрибут в технической сущности и это просто technical — пропускаем
      if (!isPerson && top.category === 'technical' && severity === 'low') continue;

      hits.push({
        key: `${entity.fqid}#${a.id}`,
        entityFqid: entity.fqid,
        attributeId: a.id,
        attributeName: a.name || a.id,
        dataType: a.dataType,
        category: top.category,
        severity,
        reasons: matched.map((m) => m.reason),
        regulation: top.regulation,
        note: top.note
      });
    }
  }

  // ============ Статистика ============
  const bySeverity: Record<PiiSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  const byCategory: Record<PiiCategory, number> = {
    identity: 0,
    contact: 0,
    document: 0,
    financial: 0,
    biometric: 0,
    special: 0,
    location: 0,
    technical: 0,
    custom: 0
  };

  const domainsMap = new Map<string, {
    domainId: string;
    domainName: string;
    entitySet: Set<string>;
    hitCount: number;
    criticalCount: number;
  }>();

  hits.forEach((h) => {
    bySeverity[h.severity]++;
    byCategory[h.category]++;

    const domainId = h.entityFqid.split('/')[0];
    if (!domainsMap.has(domainId)) {
      const meta = index.domains.find((d) => d.id === domainId);
      domainsMap.set(domainId, {
        domainId,
        domainName: meta?.name || domainId,
        entitySet: new Set(),
        hitCount: 0,
        criticalCount: 0
      });
    }
    const d = domainsMap.get(domainId)!;
    d.entitySet.add(h.entityFqid);
    d.hitCount++;
    if (h.severity === 'critical') d.criticalCount++;
  });

  const affectedEntities = new Set(hits.map((h) => h.entityFqid)).size;

  const byDomain = Array.from(domainsMap.values())
    .map((d) => ({
      domainId: d.domainId,
      domainName: d.domainName,
      entityCount: d.entitySet.size,
      hitCount: d.hitCount,
      criticalCount: d.criticalCount
    }))
    .sort((a, b) => b.criticalCount - a.criticalCount || b.hitCount - a.hitCount);

  return {
    hits,
    stats: {
      total: hits.length,
      bySeverity,
      byCategory,
      affectedEntities,
      affectedDomains: domainsMap.size
    },
    byDomain
  };
}