const $ = require("jquery");
const _ = require("lodash");

function renderResults(prospects) {
  const prospectsList = prospects.map(p =>
  `<tr>
    <td>${p.name.fullName}</td>
    <td>${p.email}</td>
    <td>${p.role}</td>
    <td>${p.seniority}</td>
    <td>${p.title}</td>
  </tr>`).join("\n");

  return `
  <div class="panel panel-default">
    <div class="panel-heading text-center">
      <h5 class="uppercase text-accented mt-05 mb-05">
        ${prospects.length} Prospected users
      </h5>
    </div>
    <table class="table table-bordered table-responsive">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Seniority</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody id="results">
      ${prospectsList}
      </tbody>
    </table>
  </div>`;
}

$(() => {
  $("form#prospect-form").on("submit", (evt) => {
    evt.preventDefault();
    const $btn = $("button#prospect");
    const titles = $("#titles")
      .val()
      .map(d => d.trim())
      .filter(d => d.length > 0)

    const domains = $("#domains")
      .val()
      .split("\n")
      .map(d => d.trim())
      .filter(d => d.length > 0)
      .sort();

    if (domains.length > 0 && titles.length > 0) {
      const data = { domains, titles };
      $btn.text("Prospecting...").attr("disabled", true);
      ["role", "seniority", "limit"].forEach(k => {
        const val = $(`#${k}`).val(); //.trim();
        if (val && val.length > 0) {
          data[k] = val;
        }
      });

      $.ajax({
        type: "POST",
        url: `/prospect${document.location.search}`,
        data,
        dataType: "json"
      }).then(
        ({ prospects = [] }) => {
          $btn.text("Prospect").prop("disabled", false);
          $("#results").html(renderResults(_.flatten(prospects)));
        },
        err => {
          $btn.val(`Oops: ${err.toString()}`).prop("disabled", false);
          $("#results").html("");
        }
      );
    }
  });
});
