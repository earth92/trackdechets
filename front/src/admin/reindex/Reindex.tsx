import * as React from "react";
import { Formik, Form, Field } from "formik";
import cogoToast from "cogo-toast";
import { gql, useMutation } from "@apollo/client";
import { Mutation, MutationReindexBsdArgs } from "generated/graphql/types";
import { InlineError } from "common/components/Error";

const REINDEX_BSD = gql`
  mutation reindexBsd($id: ID!) {
    reindexBsd(id: $id)
  }
`;
function Reindex() {
  const [reindexBsd, { loading, error }] =
    useMutation<Pick<Mutation, "reindexBsd">, MutationReindexBsdArgs>(
      REINDEX_BSD
    );

  return (
    <div className="tw-mx-2">
      <Formik
        initialValues={{
          bsdid: "",
        }}
        onSubmit={async (values, { resetForm }) => {
          const res = await reindexBsd({ variables: { id: values.bsdid } });
          resetForm();
          !!res?.data?.reindexBsd
            ? cogoToast.success(`Réindexation effectuée`, { hideAfter: 3 })
            : cogoToast.error(
                `Cet identifiant ne correspond pas à un bordereau`,
                { hideAfter: 3 }
              );
        }}
      >
        {() => (
          <Form>
            <div className="form__row">
              <label>
                ID du bsd à réindexer
                <Field
                  name="bsdid"
                  placeholder="BSD-20211215-12GH0E6TR"
                  className="td-input"
                />
              </label>
            </div>
            {error && <InlineError apolloError={error} />}
            <button
              type="submit"
              className="btn btn--primary tw-mt-1"
              disabled={loading}
            >
              {loading ? "Réindexation..." : "Réindexer"}
            </button>
          </Form>
        )}
      </Formik>
    </div>
  );
}

export default Reindex;
