export default function (err) {
  console.log('Error in stack!');
  console.log(err);
  console.log(err.stack);
}
