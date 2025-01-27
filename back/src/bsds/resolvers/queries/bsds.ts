// OLD
import { ApiResponse } from "@elastic/elasticsearch";
import {
  QueryResolvers,
  Bsd,
  QueryBsdsArgs,
  BsdType,
  OrderType
} from "../../../generated/graphql/types";
import { applyAuthStrategies, AuthType } from "../../../auth";
import { checkIsAuthenticated } from "../../../common/permissions";
import {
  client,
  BsdElastic,
  index,
  PrismaBsdMap
} from "../../../common/elastic";
import { Bsda, Bsdasri, Bsff, Bsvhu, Form } from "@prisma/client";
import prisma from "../../../prisma";
import { expandFormFromElastic } from "../../../forms/converter";
import { expandBsdasriFromElastic } from "../../../bsdasris/converter";
import { expandVhuFormFromDb } from "../../../bsvhu/converter";
import { getCachedUserSiretOrVat } from "../../../common/redis/users";
import { expandBsdaFromElastic } from "../../../bsda/converter";
import { expandBsffFromElastic } from "../../../bsffs/converter";

// complete Typescript example:
// https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/6.x/_a_complete_example.html
export interface SearchResponse<T> {
  hits: {
    total: number;
    hits: Array<{
      _source: T;
    }>;
  };
}

export interface GetResponse<T> {
  _source: T;
}

/**
 * Convert a list of BsdElastic to a mapping of prisma-like Bsds by retrieving rawBsd elastic field
 */
async function toRawBsds(bsdsElastic: BsdElastic[]): Promise<PrismaBsdMap> {
  const { BSDD, BSDASRI, BSVHU, BSDA, BSFF } = bsdsElastic.reduce<{
    BSDD: Form[];
    BSDASRI: Bsdasri[];
    BSVHU: Bsvhu[];
    BSDA: Bsda[];
    BSFF: Bsff[];
  }>(
    (acc, bsdElastic) => ({
      ...acc,
      [bsdElastic.type]: [...acc[bsdElastic.type], bsdElastic?.rawBsd]
    }),
    { BSDD: [], BSDASRI: [], BSVHU: [], BSDA: [], BSFF: [] }
  );

  return {
    bsdds: BSDD,
    bsdasris: BSDASRI,
    bsvhus: BSVHU,
    bsdas: BSDA,
    bsffs: BSFF
  };
}

async function buildQuery(
  { clue, where = {} }: QueryBsdsArgs,
  user: Express.User
) {
  const query = {
    bool: {
      must: [],
      filter: []
    }
  };

  Object.entries({
    type: where.types,
    isDraftFor: where.isDraftFor,
    isForActionFor: where.isForActionFor,
    isFollowFor: where.isFollowFor,
    isArchivedFor: where.isArchivedFor,
    isToCollectFor: where.isToCollectFor,
    isCollectedFor: where.isCollectedFor
  })
    .filter(([_, value]) => value != null)
    .forEach(([key, value]) => {
      query.bool.filter.push({
        terms: {
          [key]: value
        }
      });
    });

  if (where.emitter) {
    query.bool.must.push({
      // behaves like an OR
      bool: {
        should: [
          {
            match: {
              emitterCompanyName: {
                query: where.emitter,
                fuzziness: "AUTO"
              }
            }
          },
          {
            wildcard: {
              emitterCompanyName: {
                value: `${where.emitter}*`
              }
            }
          },
          { term: { emitterCompanySiret: where.emitter } }
        ]
      }
    });
  }

  if (where.recipient) {
    query.bool.must.push({
      bool: {
        should: [
          {
            match: {
              destinationCompanyName: {
                query: where.recipient,
                fuzziness: "AUTO"
              }
            }
          },
          {
            wildcard: {
              destinationCompanyName: {
                value: `${where.emitter}*`
              }
            }
          },
          { term: { destinationCompanySiret: where.recipient } }
        ]
      }
    });
  }

  if (where.transporterCustomInfo) {
    query.bool.must.push({
      match: {
        transporterCustomInfo: {
          query: where.transporterCustomInfo,
          fuzziness: 0
        }
      }
    });
  }

  if (where.readableId) {
    query.bool.must.push({
      bool: {
        // behaves like an OR
        should: [
          {
            match: {
              readableId: {
                query: where.readableId,
                // we need `and` operator here because the different components of
                // the readableId (prefix, date and random chars) emit different tokens
                operator: "and"
              }
            }
          },
          { term: { customId: where.readableId } },
          {
            match: { containers: { query: where.readableId, operator: "and" } }
          }
        ]
      }
    });
  }

  if (where.transporterNumberPlate) {
    query.bool.must.push({
      match: {
        transporterNumberPlate: {
          query: where.transporterNumberPlate,
          // we need `and` operator here because the different components of
          // the number plate emit different tokens
          operator: "and"
        }
      }
    });
  }

  if (where.waste) {
    query.bool.must.push({
      bool: {
        should: [
          // behaves like an OR
          {
            match: {
              // match on waste code
              "wasteCode.ngram": {
                query: where.waste
              }
            }
          },
          {
            match: {
              wasteDescription: {
                // match on waste description
                query: where.waste,
                fuzziness: "AUTO"
              }
            }
          },
          {
            wildcard: {
              wasteDescription: {
                value: `${where.waste}*`
              }
            }
          }
        ]
      }
    });
  }

  if (clue) {
    query.bool.must.push({
      multi_match: {
        query: clue,
        fields: [
          "readableId",
          "emitterCompanyName",
          "destinationCompanyName",
          "wasteDescription"
        ],
        fuzziness: "AUTO"
      }
    });
  }

  // Limit the scope of what the user can see to their companies
  const userCompaniesSiretOrVat = await getCachedUserSiretOrVat(user.id);
  query.bool.filter.push({
    terms: {
      sirets: userCompaniesSiretOrVat
    }
  });

  return query;
}

/**
 * Returns the keyword field matching the given fieldName.
 *
 * e.g passing "readableId" returns "readableId.keyword",
 *     because "redableId" is a "text" with a sub field "readableId.keyword" which is a keyword.
 *
 * e.g passing "id" returns "id", because it's already a keyword.
 *
 * This is useful for context where we are given a property but need to use its keyword counterpart.
 * For example when sorting, where it's not possible to sort on text fields.
 */
function getKeywordFieldNameFromName(fieldName: keyof BsdElastic): string {
  const property = index.mappings.properties[fieldName];

  if (property.type === "keyword") {
    // this property is of type "keyword" itself, it can be used as such
    return fieldName;
  }

  // look for a sub field with the type "keyword"
  const [subFieldName] =
    Object.entries(property.fields || {}).find(
      ([_, property]) => property.type === "keyword"
    ) ?? [];

  if (subFieldName == null) {
    throw new Error(
      `The field "${fieldName}" is not of type "keyword" and has no sub fields of that type.`
    );
  }

  return `${fieldName}.${subFieldName}`;
}

/**
 * Returns the root field name matching keywordFieldName.
 * It's the opposite of getKeywordFieldNameFromName.
 *
 * e.g passing "readableId.keyword" returns "readableId",
 *     because "readableId.keyword" is a sub field, the actual field is "readableId".
 *
 * e.g passing "id" returns "id", because "id" is the root field.
 *
 * This is useful for context where a key has been turned into its keyword counterpart
 * but we need to access the value of a document based on it.
 * For example when constructing the "search_after" array from the "sort" array.
 */
function getFieldNameFromKeyword(keywordFieldName: string): keyof BsdElastic {
  const [fieldName] = keywordFieldName.split(".");

  if (index.mappings.properties[fieldName] == null) {
    throw new Error(
      `The field "${keywordFieldName}" doesn't match a property declared in the mappings.`
    );
  }

  return fieldName as keyof BsdElastic;
}

function buildSort({ orderBy = {} }: QueryBsdsArgs) {
  const sort: Array<Record<string, OrderType>> = [
    { createdAt: "DESC" },
    // id is used as last sort to deal with ties
    // (for documents whose sorting result is equal)
    { id: "ASC" }
  ];

  (Object.entries(orderBy) as Array<[keyof typeof orderBy, OrderType]>).forEach(
    ([key, order]) => {
      sort.unshift({ [getKeywordFieldNameFromName(key)]: order });
    }
  );

  return sort;
}

// search_after is an array that contains values from the document to search after
// it must list the values that are used in the sort array
// e.g if sort is [{ emitter: "asc" }, { id: "asc" }]
//     then search_after must be [after.emitter, after.id]
async function buildSearchAfter(
  args: QueryBsdsArgs,
  sort: ReturnType<typeof buildSort>
): Promise<string[] | undefined> {
  if (args.after == null) {
    return undefined;
  }

  const {
    body: { _source: bsd }
  }: ApiResponse<GetResponse<BsdElastic>> = await client.get({
    id: args.after,
    index: index.alias,
    type: index.type
  });

  return sort.reduce(
    (acc, item) =>
      acc.concat(
        Object.entries(item).map(([key]) => bsd[getFieldNameFromKeyword(key)])
      ),
    []
  );
}

/**
 * This function takes an array of dasris and, expand them and add `allowDirectTakeOver` boolean field by
 * requesting emittercompany to know wether direct takeover is allowed
 */
async function buildDasris(dasris: Bsdasri[]) {
  // build a list of emitter siret from dasris, non-INITIAL bsds are ignored
  const emitterSirets = dasris
    .filter(bsd => !!bsd.emitterCompanySiret && bsd.status === "INITIAL")
    .map(bsd => bsd.emitterCompanySiret);

  // deduplicate sirets
  const uniqueSirets = Array.from(new Set(emitterSirets));

  // build an array of sirets allowing direct takeover
  const allows = (
    await prisma.company.findMany({
      where: {
        siret: { in: uniqueSirets },
        allowBsdasriTakeOverWithoutSignature: true
      },
      select: {
        siret: true
      }
    })
  ).map(comp => comp.siret);

  // expand dasris and insert `allowDirectTakeOver`
  return dasris.map(bsd => ({
    ...expandBsdasriFromElastic(bsd),
    allowDirectTakeOver: allows.includes(bsd.emitterCompanySiret)
  }));
}

const bsdsResolver: QueryResolvers["bsds"] = async (_, args, context) => {
  applyAuthStrategies(context, [AuthType.Session]);
  const user = checkIsAuthenticated(context);
  const MIN_SIZE = 0;
  const MAX_SIZE = 100;
  const { first = MAX_SIZE } = args;
  const size = Math.max(Math.min(first, MAX_SIZE), MIN_SIZE);

  const query = await buildQuery(args, user);
  const sort = buildSort(args);
  const search_after = await buildSearchAfter(args, sort);

  const { body }: ApiResponse<SearchResponse<BsdElastic>> = await client.search(
    {
      index: index.alias,
      body: {
        size:
          size +
          // Take one more result to know if there's a next page
          // it's removed from the actual results though
          1,
        query,
        sort,
        search_after
      }
    }
  );
  const hits = body.hits.hits.slice(0, size);

  const {
    bsdds: concreteBsdds,
    bsdasris: concreteBsdasris,
    bsvhus: concreteBsvhus,
    bsdas: concreteBsdas,
    bsffs: concreteBsffs
  } = await toRawBsds(hits.map(hit => hit._source));

  const bsds: Record<BsdType, Bsd[]> = {
    BSDD: await Promise.all(concreteBsdds.map(expandFormFromElastic)),
    BSDASRI: await buildDasris(concreteBsdasris),
    BSVHU: concreteBsvhus.map(expandVhuFormFromDb),
    BSDA: concreteBsdas.map(expandBsdaFromElastic),
    BSFF: concreteBsffs.map(expandBsffFromElastic)
  };
  const edges = hits
    .reduce<Array<Bsd>>((acc, { _source: { type, id } }) => {
      const bsd = bsds[type].find(bsd => bsd.id === id);

      if (bsd) {
        // filter out null values in case Elastic Search
        // is desynchronized with the actual database
        return acc.concat(bsd);
      }

      return acc;
    }, [])
    .map(node => ({
      cursor: node.id,
      node
    }));

  const pageInfo = {
    // startCursor and endCursor are null if the list is empty
    // this is not 100% spec compliant but there are discussions to change that:
    // https://github.com/facebook/relay/issues/1852
    // https://github.com/facebook/relay/pull/2655
    startCursor: edges[0]?.cursor || null,
    endCursor: edges[edges.length - 1]?.cursor || null,

    hasNextPage: body.hits.hits.length > size,
    hasPreviousPage: false
  };

  return {
    edges,
    pageInfo,
    totalCount: body.hits.total
  };
};

export default bsdsResolver;
