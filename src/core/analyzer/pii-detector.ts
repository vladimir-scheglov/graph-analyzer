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

const RULES: Rule[] = [
  // ============ SPECIAL — спецкатегории ============
  {
    pattern: /\b(passport|паспорт|passportnumber|passportno)\b/i,
    category: 'document',
    severity: 'critical',
    reason: 'документ, удостоверяющий личность',
    regulation: 'GDPR Art. 9 / 152-ФЗ',
    note: 'Спецкатегория ПДн — требует повышенной защиты'
  },
  {
    pattern: /\b(ssn|socialsecurity|nationalid|nationalnumber)\b/i,
    category: 'document',
    severity: 'critical',
    reason: 'национальный идентификационный номер',
    regulation: 'GDPR Art. 9 / 152-ФЗ',
    note: 'Спецкатегория ПДн'
  },
  {
    pattern: /\b(inn|инн|snils|снилс|ogrn|огрн|kpp|кпп)\b/i,
    category: 'document',
    severity: 'critical',
    reason: 'российский идентификатор',
    regulation: '152-ФЗ',
    note: 'Регуляторно значимый идентификатор'
  },
  {
    pattern: /\b(driverlicense|driverlicence|licence|водительское)\b/i,
    category: 'document',
    severity: 'high',
    reason: 'водительское удостоверение',
    regulation: '152-ФЗ',
    note: 'Персональный документ'
  },
  {
    pattern: /\b(birthdate|dateofbirth|birthday|дата рождения|др)\b/i,
    category: 'identity',
    severity: 'high',
    reason: 'дата рождения',
    regulation: 'GDPR Art. 4 / 152-ФЗ',
    note: 'Персональные данные + квази-идентификатор'
  },
  {
    pattern: /\b(religion|религия|вероисповедание)\b/i,
    category: 'special',
    severity: 'critical',
    reason: 'религиозные убеждения',
    regulation: 'GDPR Art. 9 / 152-ФЗ спецкатегория',
    note: 'Спецкатегория — нельзя обрабатывать без явного согласия'
  },
  {
    pattern: /\b(ethnicity|ethnic|национальность|раса|race)\b/i,
    category: 'special',
    severity: 'critical',
    reason: 'этническая принадлежность',
    regulation: 'GDPR Art. 9',
    note: 'Спецкатегория'
  },
  {
    pattern: /\b(politicalview|political|политическ)\b/i,
    category: 'special',
    severity: 'critical',
    reason: 'политические убеждения',
    regulation: 'GDPR Art. 9',
    note: 'Спецкатегория'
  },
  {
    pattern: /\b(health|medical|diagnosis|диагноз|здоровь|болезн|медицин)\b/i,
    category: 'special',
    severity: 'critical',
    reason: 'данные о здоровье',
    regulation: 'GDPR Art. 9 / 152-ФЗ спецкатегория',
    note: 'Медицинская тайна'
  },
  {
    pattern: /\b(biometric|fingerprint|retina|faceid|voiceprint|отпечат|биометр)\b/i,
    category: 'biometric',
    severity: 'critical',
    reason: 'биометрические данные',
    regulation: 'GDPR Art. 9 / 152-ФЗ',
    note: 'Биометрия — спецкатегория, требует отдельного согласия'
  },
  {
    pattern: /\b(sexual|orientation|сексуальн)\b/i,
    category: 'special',
    severity: 'critical',
    reason: 'сексуальная ориентация',
    regulation: 'GDPR Art. 9',
    note: 'Спецкатегория'
  },

  // ============ FINANCIAL ============
  {
    pattern: /\b(cardnumber|cardno|pan|creditcard|debitcard|карта номер)\b/i,
    category: 'financial',
    severity: 'critical',
    reason: 'номер банковской карты',
    regulation: 'PCI DSS',
    note: 'Запрещено хранить в открытом виде'
  },
  {
    pattern: /\b(cvv|cvc|cvv2|cvc2)\b/i,
    category: 'financial',
    severity: 'critical',
    reason: 'CVV/CVC код карты',
    regulation: 'PCI DSS',
    note: 'Запрещено хранить вообще'
  },
  {
    pattern: /\b(iban|swift|bic|bankaccount|bankaccountnumber|расчетный счет|р\/с)\b/i,
    category: 'financial',
    severity: 'critical',
    reason: 'банковские реквизиты',
    regulation: '152-ФЗ / PCI DSS',
    note: 'Финансовая информация'
  },

  // ============ IDENTITY / CONTACT ============
  {
    pattern: /\b(firstname|lastname|middlename|surname|givenname|patronymic|fullname|имя|фамилия|отчество)\b/i,
    category: 'identity',
    severity: 'high',
    reason: 'ФИО',
    regulation: 'GDPR Art. 4 / 152-ФЗ',
    note: 'Персональные данные'
  },
  {
    pattern: /\b(e?mail|emailaddress|почта|электронн)\b/i,
    category: 'contact',
    severity: 'high',
    reason: 'email',
    regulation: 'GDPR Art. 4 / 152-ФЗ',
    note: 'Контактные данные'
  },
  {
    pattern: /\b(phone|mobile|mobilephone|telephone|tel|phoneNumber|телефон|мобильн)\b/i,
    category: 'contact',
    severity: 'high',
    reason: 'телефон',
    regulation: 'GDPR Art. 4 / 152-ФЗ',
    note: 'Контактные данные'
  },
  {
    pattern: /\b(address|postaladdress|streetaddress|homeaddress|адрес|улица|дом)\b/i,
    category: 'contact',
    severity: 'high',
    reason: 'почтовый адрес',
    regulation: 'GDPR Art. 4 / 152-ФЗ',
    note: 'Контактные данные'
  },

  // ============ LOCATION ============
  {
    pattern: /\b(geolocation|location|coordinates|координат|местополож)\b/i,
    category: 'location',
    severity: 'high',
    reason: 'геолокация',
    regulation: 'GDPR Art. 4',
    note: 'Квази-идентификатор, особо чувствительно'
  },
  {
    pattern: /\b(city|город|region|регион|country|страна|zip|postcode|индекс)\b/i,
    category: 'location',
    severity: 'medium',
    reason: 'географические данные',
    note: 'Квази-идентификатор в комбинации'
  },

  // ============ TECHNICAL ============
  {
    pattern: /\b(ipaddress|ipaddr|ip|ipv4|ipv6|host|хост)\b/i,
    category: 'technical',
    severity: 'medium',
    reason: 'IP-адрес',
    regulation: 'GDPR (Recital 30)',
    note: 'PII в контексте персональных сущностей'
  },
  {
    pattern: /\b(deviceid|deviceidentifier|macaddress|imei|mac)\b/i,
    category: 'technical',
    severity: 'medium',
    reason: 'идентификатор устройства',
    regulation: 'GDPR',
    note: 'Квази-идентификатор'
  },
  {
    pattern: /\b(cookie|cookies|trackingid|useragent)\b/i,
    category: 'technical',
    severity: 'medium',
    reason: 'трекер',
    regulation: 'GDPR / ePrivacy',
    note: 'Требует согласия на cookie'
  },
  {
    pattern: /\b(userid|user_id|accountid|customerid|clientid|personid)\b/i,
    category: 'technical',
    severity: 'low',
    reason: 'внутренний идентификатор',
    note: 'PII в связке с другими данными'
  }
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